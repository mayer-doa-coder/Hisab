const userHotwordStore = new Map();
const userShortcutStore = new Map();

const toUserKey = (userId) => String(userId || 'anonymous').trim() || 'anonymous';

const normalizeText = (value) =>
  String(value || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');

const ensureHotwordBucket = (userKey) => {
  if (!userHotwordStore.has(userKey)) {
    userHotwordStore.set(userKey, {
      customers: [],
      products: [],
      branches: [],
    });
  }
  return userHotwordStore.get(userKey);
};

const ensureShortcutBucket = (userKey) => {
  if (!userShortcutStore.has(userKey)) {
    userShortcutStore.set(userKey, []);
  }
  return userShortcutStore.get(userKey);
};

export const setUserHotwords = ({ userId, customers = [], products = [], branches = [] } = {}) => {
  const userKey = toUserKey(userId);
  userHotwordStore.set(userKey, {
    customers: [...customers],
    products: [...products],
    branches: [...branches],
  });
};

export const addUserCommandShortcut = ({ userId, triggerPhrase, expansionText } = {}) => {
  const trigger = normalizeText(triggerPhrase);
  const expansion = String(expansionText || '').trim();
  if (!trigger || !expansion) {
    return false;
  }

  const userKey = toUserKey(userId);
  const rows = ensureShortcutBucket(userKey);

  const deduped = rows.filter((item) => item.trigger !== trigger);
  deduped.push({ trigger, expansion });
  userShortcutStore.set(userKey, deduped);
  return true;
};

export const applyUserShortcut = ({ userId, utterance } = {}) => {
  const userKey = toUserKey(userId);
  const raw = String(utterance || '').trim();
  if (!raw) {
    return {
      rewrittenText: raw,
      matchedShortcut: null,
    };
  }

  const normalizedInput = normalizeText(raw);
  const rows = ensureShortcutBucket(userKey);

  const match = rows.find((item) => normalizedInput === item.trigger || normalizedInput.startsWith(`${item.trigger} `));
  if (!match) {
    return {
      rewrittenText: raw,
      matchedShortcut: null,
    };
  }

  const suffix = normalizedInput === match.trigger
    ? ''
    : raw.slice(raw.toLowerCase().indexOf(match.trigger) + match.trigger.length).trim();

  return {
    rewrittenText: suffix ? `${match.expansion} ${suffix}`.trim() : match.expansion,
    matchedShortcut: match.trigger,
  };
};

export const getUserPersonalizationResources = ({ userId } = {}) => {
  const userKey = toUserKey(userId);
  const hotwords = ensureHotwordBucket(userKey);
  return {
    customers: [...(hotwords.customers || [])],
    products: [...(hotwords.products || [])],
    branches: [...(hotwords.branches || [])],
  };
};

export default {
  setUserHotwords,
  addUserCommandShortcut,
  applyUserShortcut,
  getUserPersonalizationResources,
};
