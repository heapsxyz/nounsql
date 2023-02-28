import {
  MaxQuorumVotesBPSSet,
  MinQuorumVotesBPSSet,
  ProposalCanceled,
  ProposalCreatedWithRequirements,
  ProposalExecuted,
  ProposalQueued,
  ProposalVetoed,
  QuorumCoefficientSet,
  VoteCast,
} from './types/NounsDAO/NounsDAO';
import {
  getGovernanceEntity,
  getOrCreateDelegate,
  getOrCreateDelegateWithNullOption,
  getOrCreateDynamicQuorumParams,
  getOrCreateProposal,
  getOrCreateVote,
} from './utils/helpers';
import {
  BIGINT_ONE,
  BIGINT_ZERO,
  STATUS_ACTIVE,
  STATUS_CANCELLED,
  STATUS_EXECUTED,
  STATUS_PENDING,
  STATUS_QUEUED,
  STATUS_VETOED,
} from './utils/constants';
import {dynamicQuorumVotes} from './utils/dynamicQuorum';
import {log} from "@/lib/stub";

export async function handleProposalCreatedWithRequirements(
  event: ProposalCreatedWithRequirements,
) {
  let proposal = await getOrCreateProposal(event.params.id.toString());
  let proposer = await getOrCreateDelegateWithNullOption(event.params.proposer, false);

  // Check if the proposer was a delegate already accounted for, if not we should log an error
  // since it shouldn't be possible for a delegate to propose anything without first being 'created'
  if (proposer == null) {
    log.error('Delegate {} not found on ProposalCreated. tx_hash: {}', [
      event.params.proposer,
      event.transaction.hash,
    ]);
  }
  // Create it anyway since we will want to account for this event data, even though it should've never happened
  proposer = await getOrCreateDelegate(event.params.proposer);
  proposal.proposer = proposer.id;
  proposal.targets = event.params.targets.concat();
  proposal.values = event.params.values.map((value) => value.toString());
  proposal.signatures = event.params.signatures.concat();
  proposal.calldatas = event.params.calldatas.map((calldata) => calldata.toString());
  proposal.createdTimestamp = event.block.timestamp.toString();
  proposal.createdBlock = event.block.number.toString();
  proposal.createdTransactionHash = event.transaction.hash;
  proposal.startBlock = event.params.startBlock.toString();
  proposal.endBlock = event.params.endBlock.toString();
  proposal.proposalThreshold = event.params.proposalThreshold.toString();
  proposal.quorumVotes = event.params.quorumVotes.toString();
  proposal.forVotes = BIGINT_ZERO.toString();
  proposal.againstVotes = BIGINT_ZERO.toString();
  proposal.abstainVotes = BIGINT_ZERO.toString();
  proposal.description = event.params.description.split('\\n').join('\n'); // The Graph's AssemblyScript version does not support string.replace
  proposal.status = event.block.number >= BigInt(proposal.startBlock) ? STATUS_ACTIVE : STATUS_PENDING;

  // Storing state for dynamic quorum calculations
  // Doing these for V1 props as well to avoid making these fields optional + avoid missing required field warnings
  const governance = await getGovernanceEntity();
  proposal.totalSupply = governance.totalTokenHolders;

  const dynamicQuorum = await getOrCreateDynamicQuorumParams();
  proposal.minQuorumVotesBPS = dynamicQuorum.minQuorumVotesBPS;
  proposal.maxQuorumVotesBPS = dynamicQuorum.maxQuorumVotesBPS;
  proposal.quorumCoefficient = dynamicQuorum.quorumCoefficient;

  await proposal.save();
}

export async function handleProposalCanceled(event: ProposalCanceled) {
  let proposal = await getOrCreateProposal(event.params.id.toString());

  proposal.status = STATUS_CANCELLED;
  await proposal.save();
}

export async function handleProposalVetoed(event: ProposalVetoed) {
  let proposal = await getOrCreateProposal(event.params.id.toString());

  proposal.status = STATUS_VETOED;
  await proposal.save();
}

export async function handleProposalQueued(event: ProposalQueued) {
  let governance = await getGovernanceEntity();
  let proposal = await getOrCreateProposal(event.params.id.toString());

  proposal.status = STATUS_QUEUED;
  proposal.executionETA = event.params.eta.toString();
  await proposal.save();

  governance.proposalsQueued = (BigInt(governance.proposalsQueued) - BIGINT_ONE).toString();
  await governance.save();
}

export async function handleProposalExecuted(event: ProposalExecuted) {
  let governance = await getGovernanceEntity();
  let proposal = await getOrCreateProposal(event.params.id.toString());

  proposal.status = STATUS_EXECUTED;
  proposal.executionETA = null;
  await proposal.save();

  governance.proposalsQueued = (BigInt(governance.proposalsQueued) - BIGINT_ONE).toString();
  await governance.save();
}

export async function handleVoteCast(event: VoteCast) {
  let proposal = await getOrCreateProposal(event.params.proposalId.toString());
  let voteId = event.params.voter
    .concat('-')
    .concat(event.params.proposalId.toString());
  let vote = await getOrCreateVote(voteId);
  let voter = await getOrCreateDelegateWithNullOption(event.params.voter, false);

  // Check if the voter was a delegate already accounted for, if not we should log an error
  // since it shouldn't be possible for a delegate to vote without first being 'created'
  if (voter == null) {
    log.error('Delegate {} not found on VoteCast. tx_hash: {}', [
      event.params.voter,
      event.transaction.hash,
    ]);
  }

  // Create it anyway since we will want to account for this event data, even though it should've never happened
  voter = await getOrCreateDelegate(event.params.voter);

  vote.proposal = proposal.id;
  vote.voter = voter.id;
  vote.votesRaw = event.params.votes.toString();
  vote.votes = event.params.votes.toString();
  vote.support = event.params.support == 1;
  vote.supportDetailed = event.params.support;
  vote.nouns = voter.nounsRepresented;
  vote.blockNumber = event.block.number.toString();

  if (event.params.reason != '') {
    vote.reason = event.params.reason;
  }

  await vote.save();

  if (event.params.support == 0) {
    proposal.againstVotes = (BigInt(proposal.againstVotes) + BigInt(event.params.votes)).toString();
  } else if (event.params.support == 1) {
    proposal.forVotes = (BigInt(proposal.forVotes) + event.params.votes).toString();
  } else if (event.params.support == 2) {
    proposal.abstainVotes = (BigInt(proposal.abstainVotes) + event.params.votes).toString();
  }

  const dqParams = await getOrCreateDynamicQuorumParams();
  const usingDynamicQuorum =
    dqParams.dynamicQuorumStartBlock !== null &&
    BigInt(dqParams.dynamicQuorumStartBlock) < BigInt(proposal.createdBlock);

  if (usingDynamicQuorum) {
    proposal.quorumVotes = dynamicQuorumVotes(
      BigInt(proposal.againstVotes),
      BigInt(proposal.totalSupply),
      Number(proposal.minQuorumVotesBPS),
      Number(proposal.maxQuorumVotesBPS),
      BigInt(proposal.quorumCoefficient),
    ).toString();
  }

  if (proposal.status == STATUS_PENDING) {
    proposal.status = STATUS_ACTIVE;
  }
  await proposal.save();
}

export async function handleMinQuorumVotesBPSSet(event: MinQuorumVotesBPSSet) {
  const params = await getOrCreateDynamicQuorumParams(event.block.number);
  params.minQuorumVotesBPS = event.params.newMinQuorumVotesBPS;
  await params.save();
}

export async function handleMaxQuorumVotesBPSSet(event: MaxQuorumVotesBPSSet) {
  const params = await getOrCreateDynamicQuorumParams(event.block.number);
  params.maxQuorumVotesBPS = event.params.newMaxQuorumVotesBPS;
  await params.save();
}

export async function handleQuorumCoefficientSet(event: QuorumCoefficientSet) {
  const params = await getOrCreateDynamicQuorumParams(event.block.number);
  params.quorumCoefficient = event.params.newQuorumCoefficient.toString();
  await params.save();
}
