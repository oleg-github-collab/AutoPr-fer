const basicPrompt = require('./basic');
const standardPrompt = require('./standard');
const premiumPrompt = require('./premium');

function getPrompt(plan) {
  switch(plan) {
    case 'basic':
      return basicPrompt;
    case 'standard':
      return standardPrompt;
    case 'premium':
      return premiumPrompt;
    default:
      return basicPrompt;
  }
}

module.exports = { getPrompt };