if (typeof document !== 'undefined') {
  document.addEventListener('DOMContentLoaded', () => {
    const btnDemo = document.getElementById('btn-open-demo');
    const btnClose = document.getElementById('btn-close-welcome');

    if (btnDemo) {
      btnDemo.addEventListener('click', () => {
        if (typeof chrome !== 'undefined' && chrome.tabs) {
          const viewerUrl = chrome.runtime.getURL('viewer.html') + '?file=' + encodeURIComponent('https://raw.githubusercontent.com/mozilla/pdf.js/ba2edeae/web/compressed.tracemonkey-pldi-09.pdf');
          chrome.tabs.create({ url: viewerUrl });
        } else {
          window.location.href = 'viewer.html?file=' + encodeURIComponent('https://raw.githubusercontent.com/mozilla/pdf.js/ba2edeae/web/compressed.tracemonkey-pldi-09.pdf');
        }
      });
    }

    if (btnClose) {
      btnClose.addEventListener('click', () => {
        window.close();
      });
    }
  });
}
