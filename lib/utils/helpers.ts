import {Account, Delegate, DynamicQuorumParams, Governance, Proposal, Vote,} from '../types/schema';
import {BIGINT_ONE, BIGINT_ZERO, ZERO_ADDRESS} from './constants';

export async function getOrCreateAccount(
  id: string,
  createIfNotFound: boolean = true,
  save: boolean = true,
): Promise<Account> {
  let tokenHolder = await Account.load(id);
  if (tokenHolder == null && createIfNotFound) {
    tokenHolder = new Account(id);
    tokenHolder.tokenBalanceRaw = BIGINT_ZERO.toString();
    tokenHolder.tokenBalance = BIGINT_ZERO.toString();
    tokenHolder.totalTokensHeldRaw = BIGINT_ZERO.toString();
    tokenHolder.totalTokensHeld = BIGINT_ZERO.toString();
    tokenHolder.nouns = [];

    if (save) {
      await tokenHolder.save();
    }
  }

  return tokenHolder as Account;
}

// These two functions are split up to minimize the extra code required
// to handle return types with `Type | null`
export async function getOrCreateDelegate(id: string): Promise<Delegate> {
  return getOrCreateDelegateWithNullOption(id, true, true) as Promise<Delegate>;
}

export async function getOrCreateDelegateWithNullOption(
  id: string,
  createIfNotFound: boolean = true,
  save: boolean = true,
): Promise<Delegate | null> {
  let delegate = await Delegate.load(id);
  if (delegate == null && createIfNotFound) {
    delegate = new Delegate(id);
    delegate.delegatedVotesRaw = BIGINT_ZERO.toString();
    delegate.delegatedVotes = BIGINT_ZERO.toString();
    delegate.tokenHoldersRepresentedAmount = 0;
    delegate.nounsRepresented = [];
    if (id != ZERO_ADDRESS) {
      let governance = await getGovernanceEntity();
      governance.totalDelegates = (BigInt(governance.totalDelegates) + BIGINT_ONE).toString();
      await governance.save();
    }
    if (save) {
      await delegate.save();
    }
  }
  return delegate;
}

export async function getOrCreateVote(
  id: string,
  createIfNotFound: boolean = true,
  save: boolean = false,
): Promise<Vote> {
  let vote = await Vote.load(id);

  if (vote == null && createIfNotFound) {
    vote = new Vote(id);

    if (save) {
      await vote.save();
    }
  }

  return vote as Vote;
}

export async function getOrCreateProposal(
  id: string,
  createIfNotFound: boolean = true,
  save: boolean = false,
): Promise<Proposal> {
  let proposal = await Proposal.load(id);

  if (proposal == null && createIfNotFound) {
    proposal = new Proposal(id);

    let governance = await getGovernanceEntity();

    governance.proposals = (BigInt(governance.proposals) + BIGINT_ONE).toString();
    await governance.save();

    if (save) {
      await proposal.save();
    }
  }

  return proposal as Proposal;
}

export async function getGovernanceEntity(): Promise<Governance> {
  let governance = await Governance.load('GOVERNANCE');

  if (governance == null) {
    governance = new Governance('GOVERNANCE');
    governance.proposals = BIGINT_ZERO.toString();
    governance.totalTokenHolders = BIGINT_ZERO.toString();
    governance.currentTokenHolders = BIGINT_ZERO.toString();
    governance.currentDelegates = BIGINT_ZERO.toString();
    governance.totalDelegates = BIGINT_ZERO.toString();
    governance.delegatedVotesRaw = BIGINT_ZERO.toString();
    governance.delegatedVotes = BIGINT_ZERO.toString();
    governance.proposalsQueued = BIGINT_ZERO.toString();
  }

  return governance;
}

export async function getOrCreateDynamicQuorumParams(block: BigInt | null = null): Promise<DynamicQuorumParams> {
  let params = await DynamicQuorumParams.load('LATEST');

  if (params == null) {
    params = new DynamicQuorumParams('LATEST');
    params.minQuorumVotesBPS = 0;
    params.maxQuorumVotesBPS = 0;
    params.quorumCoefficient = BIGINT_ZERO.toString();
    params.dynamicQuorumStartBlock = block ? block.toString() : null;

    await params.save();
  }

  if (params.dynamicQuorumStartBlock === null && block !== null) {
    params.dynamicQuorumStartBlock = block ? block.toString() : null;

    await params.save();
  }

  return params as DynamicQuorumParams;
}
