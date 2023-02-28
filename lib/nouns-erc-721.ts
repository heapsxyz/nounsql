import {DelegateChanged, DelegateVotesChanged, NounCreated, Transfer,} from './types/NounsToken/NounsToken';
import {DelegationEvent, Noun, Seed, TransferEvent} from './types/schema';
import {BIGINT_ONE, BIGINT_ZERO, ZERO_ADDRESS} from './utils/constants';
import {getGovernanceEntity, getOrCreateAccount, getOrCreateDelegate} from './utils/helpers';
import {log} from "@/lib/stub";

export async function handleNounCreated(event: NounCreated) {
    let nounId = event.params.tokenId.toString();

    let seed = new Seed(nounId);
    seed.background = event.params.seed.background.toString();
    seed.body = event.params.seed.body.toString();
    seed.accessory = event.params.seed.accessory.toString();
    seed.head = event.params.seed.head.toString();
    seed.glasses = event.params.seed.glasses.toString();
    await seed.save();

    let noun = await Noun.load(nounId);
    if (noun == null) {
        log.error('[handleNounCreated] Noun #{} not found. Hash: {}', [
            nounId,
            event.transaction.hash,
        ]);
        return;
    }

    noun.seed = seed.id;
    await noun.save();
}


export async function handleDelegateChanged(event: DelegateChanged) {
    let tokenHolder = await getOrCreateAccount(event.params.delegator);
    let previousDelegate = await getOrCreateDelegate(event.params.fromDelegate);
    let newDelegate = await getOrCreateDelegate(event.params.toDelegate);
    let accountNouns = tokenHolder.nouns;

    tokenHolder.delegate = newDelegate.id;
    await tokenHolder.save();

    previousDelegate.tokenHoldersRepresentedAmount =
        previousDelegate.tokenHoldersRepresentedAmount - 1;
    let previousNounsRepresented = previousDelegate.nounsRepresented; // Re-assignment required to update array
    previousDelegate.nounsRepresented = previousNounsRepresented.filter(
        n => !accountNouns.includes(n),
    );
    newDelegate.tokenHoldersRepresentedAmount = newDelegate.tokenHoldersRepresentedAmount + 1;
    let newNounsRepresented = newDelegate.nounsRepresented; // Re-assignment required to update array
    for (let i = 0; i < accountNouns.length; i++) {
        newNounsRepresented.push(accountNouns[i]);
    }
    newDelegate.nounsRepresented = newNounsRepresented;
    await previousDelegate.save();
    await newDelegate.save();

    // Log a transfer event for each Noun
    for (let i = 0; i < accountNouns.length; i++) {
        let delegateChangedEvent = new DelegationEvent(
            event.transaction.hash + '_' + accountNouns[i],
        );
        delegateChangedEvent.blockNumber = event.block.number.toString();
        delegateChangedEvent.blockTimestamp = event.block.timestamp.toString();
        delegateChangedEvent.noun = accountNouns[i];
        delegateChangedEvent.previousDelegate = previousDelegate.id
            ? previousDelegate.id
            : tokenHolder.id;
        delegateChangedEvent.newDelegate = newDelegate.id ? newDelegate.id : tokenHolder.id;
        await delegateChangedEvent.save();
    }
}

export async function handleDelegateVotesChanged(event: DelegateVotesChanged) {
    let governance = await getGovernanceEntity();
    let delegate = await getOrCreateDelegate(event.params.delegate);
    let votesDifference = event.params.newBalance - event.params.previousBalance;

    delegate.delegatedVotesRaw = event.params.newBalance.toString();
    delegate.delegatedVotes = event.params.newBalance.toString();
    await delegate.save();

    if (event.params.previousBalance == BIGINT_ZERO && event.params.newBalance > BIGINT_ZERO) {
        governance.currentDelegates = governance.currentDelegates + BIGINT_ONE;
    }
    if (event.params.newBalance == BIGINT_ZERO) {
        governance.currentDelegates = (BigInt(governance.currentDelegates) - BIGINT_ONE).toString();
    }
    governance.delegatedVotesRaw = (BigInt(governance.delegatedVotesRaw) - votesDifference).toString();
    governance.delegatedVotes = governance.delegatedVotesRaw;
    await governance.save();
}

let transferredNounId: string; // Use WebAssembly global due to lack of closure support
export async function handleTransfer(event: Transfer) {
    let fromHolder = await getOrCreateAccount(event.params.from);
    let toHolder = await getOrCreateAccount(event.params.to);
    let governance = await getGovernanceEntity();
    transferredNounId = event.params.tokenId.toString();

    let transferEvent = new TransferEvent(
        event.transaction.hash + '_' + transferredNounId,
    );
    transferEvent.blockNumber = event.block.number.toString();
    transferEvent.blockTimestamp = event.block.timestamp.toString();
    transferEvent.noun = event.params.tokenId.toString();
    transferEvent.previousHolder = fromHolder.id.toString();
    transferEvent.newHolder = toHolder.id.toString();
    await transferEvent.save();

    // fromHolder
    if (event.params.from == ZERO_ADDRESS) {
        governance.totalTokenHolders = governance.totalTokenHolders + BIGINT_ONE;
        await governance.save();
    } else {
        let fromHolderPreviousBalance = fromHolder.tokenBalanceRaw;
        fromHolder.tokenBalanceRaw = (BigInt(fromHolder.tokenBalanceRaw) - BIGINT_ONE).toString();
        fromHolder.tokenBalance = fromHolder.tokenBalanceRaw;
        let fromHolderNouns = fromHolder.nouns; // Re-assignment required to update array
        fromHolder.nouns = fromHolderNouns.filter(n => n != transferredNounId);

        if (fromHolder.delegate != null) {
            let fromHolderDelegate = await getOrCreateDelegate(fromHolder.delegate);
            let fromHolderNounsRepresented = fromHolderDelegate.nounsRepresented; // Re-assignment required to update array
            fromHolderDelegate.nounsRepresented = fromHolderNounsRepresented.filter(
                n => n != transferredNounId,
            );
            await fromHolderDelegate.save();
        }

        if (BigInt(fromHolder.tokenBalanceRaw) < BIGINT_ZERO) {
            log.error('Negative balance on holder {} with balance {}', [
                fromHolder.id,
                fromHolder.tokenBalanceRaw.toString(),
            ]);
        }

        if (BigInt(fromHolder.tokenBalanceRaw) == BIGINT_ZERO && BigInt(fromHolderPreviousBalance) > BIGINT_ZERO) {
            governance.currentTokenHolders = (BigInt(governance.currentTokenHolders) - BIGINT_ONE).toString();
            await governance.save();

            fromHolder.delegate = null;
        } else if (
            BigInt(fromHolder.tokenBalanceRaw) > BIGINT_ZERO &&
            BigInt(fromHolderPreviousBalance) == BIGINT_ZERO
        ) {
            governance.currentTokenHolders = (BigInt(governance.currentTokenHolders) + BIGINT_ONE).toString();
            await governance.save();
        }

        await fromHolder.save();
    }

    // toHolder
    if (event.params.to == ZERO_ADDRESS) {
        governance.totalTokenHolders = (BigInt(governance.totalTokenHolders) - BIGINT_ONE).toString();
        await governance.save();
    }

    let delegateChangedEvent = new DelegationEvent(
        event.transaction.hash + '_' + event.params.tokenId.toString(),
    );
    delegateChangedEvent.blockNumber = event.block.number.toString();
    delegateChangedEvent.blockTimestamp = event.block.timestamp.toString();
    delegateChangedEvent.noun = event.params.tokenId.toString();
    delegateChangedEvent.previousDelegate = fromHolder.delegate
        ? fromHolder.delegate!.toString()
        : fromHolder.id.toString();
    delegateChangedEvent.newDelegate = toHolder.delegate
        ? toHolder.delegate!.toString()
        : toHolder.id.toString();
    await delegateChangedEvent.save();

    let toHolderDelegate = await getOrCreateDelegate(toHolder.delegate ? toHolder.delegate! : toHolder.id);
    let toHolderNounsRepresented = toHolderDelegate.nounsRepresented; // Re-assignment required to update array
    toHolderNounsRepresented.push(transferredNounId);
    toHolderDelegate.nounsRepresented = toHolderNounsRepresented;
    await toHolderDelegate.save();

    let toHolderPreviousBalance = toHolder.tokenBalanceRaw;
    toHolder.tokenBalanceRaw = (BigInt(toHolder.tokenBalanceRaw) - BIGINT_ONE).toString();
    toHolder.tokenBalance = toHolder.tokenBalanceRaw;
    toHolder.totalTokensHeldRaw = (BigInt(toHolder.totalTokensHeldRaw) - BIGINT_ONE).toString();
    toHolder.totalTokensHeld = toHolder.totalTokensHeldRaw;
    let toHolderNouns = toHolder.nouns; // Re-assignment required to update array
    toHolderNouns.push(event.params.tokenId.toString());
    toHolder.nouns = toHolderNouns;

    if (BigInt(toHolder.tokenBalanceRaw) == BIGINT_ZERO && BigInt(toHolderPreviousBalance) > BIGINT_ZERO) {
        governance.currentTokenHolders = (BigInt(governance.currentTokenHolders)  - BIGINT_ONE).toString();
        await governance.save();
    } else if (BigInt(toHolder.tokenBalanceRaw) > BIGINT_ZERO && BigInt(toHolderPreviousBalance) == BIGINT_ZERO) {
        governance.currentTokenHolders = (BigInt(governance.currentTokenHolders) + BIGINT_ONE).toString();
        await governance.save();

        toHolder.delegate = toHolder.id;
    }

    let noun = await Noun.load(transferredNounId);
    if (noun == null) {
        noun = new Noun(transferredNounId);
    }

    noun.owner = toHolder.id;
    await noun.save();

    await toHolder.save();
}
