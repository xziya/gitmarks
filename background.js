// Background script
console.log('GitMarks extension loaded');

// Listen for browser startup event
chrome.runtime.onStartup.addListener(function() {
  console.log('Browser started, extension initialized');
});

// Listen for installation event
chrome.runtime.onInstalled.addListener(function(details) {
  if (details.reason === 'install') {
    console.log('Extension first installed');
  } else if (details.reason === 'update') {
    console.log('Extension updated to version', details.previousVersion);
  }
});
