// Compared case-insensitively by validate-config.js and stored lowercase in
// config.json by merge-config.js.
const PROTOCOL_CATEGORIES = ['Money Market', 'Yield Strategy', 'Liquid Locker', 'CEX / Web3 Wallet', 'Insurance', 'Others'];

const DESCRIPTION_MAXIMUM_CHARACTERS = 120;

const SUBTITLE_MAXIMUM_CHARACTERS = 20;

module.exports = {
  PROTOCOL_CATEGORIES,
  DESCRIPTION_MAXIMUM_CHARACTERS,
  SUBTITLE_MAXIMUM_CHARACTERS,
}