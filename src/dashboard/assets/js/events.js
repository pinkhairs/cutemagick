// /js/events.js
(function () {
  function emit(name, detail) {
    document.body.dispatchEvent(
      new CustomEvent(name, { detail,
          bubbles: true,
         composed: true },
      )
    );
  }

  window.CuteMagickEvents = {
    emit,
    commitsChanged(siteId) {
      emit('commitsChanged', { siteId });
    },
    filesChanged(siteId) {
      emit('filesChanged', { siteId });
    },
    sitesChanged() {
      emit('refreshSites');
    }
  };
})();