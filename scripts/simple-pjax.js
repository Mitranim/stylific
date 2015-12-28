/**
 * Source and documentation:
 *   https://github.com/Mitranim/simple-pjax
 */

!function() {
'use strict';

// No-op if not running in a browser.
if (typeof window !== 'object' || !window) return;

// No-op if pushState is unavailable.
if (typeof history.pushState !== 'function') return;

/* global location, XMLHttpRequest, Location, requestAnimationFrame, cancelAnimationFrame, history, HTMLElement, HTMLScriptElement, HTMLAnchorElement, HTMLDocument, DOMParser, Event, getComputedStyle */

/**
 * Export.
 */
var pjax = {

  /**
   * Configuration.
   */

  // Disables pjax globally.
  disabled: false,

  // How long until we run loading indicators.
  loadIndicatorDelay: 250,

  // Called when loading takes longer than `loadIndicatorDelay`. Should
  // visibly indicate the loading.
  onIndicateLoadStart: function onIndicateLoadStart() {
    document.documentElement.style.transition = 'opacity linear 0.05s';
    document.documentElement.style.opacity = '0.8';
  },

  // Called when transition is finished. Should roll back the effects of
  // `onIndicateLoadStart`.
  onIndicateLoadEnd: function onIndicateLoadEnd() {
    document.documentElement.style.transition = '';
    document.documentElement.style.opacity = '';
  },

  // If a CSS selector is provided, it's checked every time when scrolling to an
  // element (e.g. via data-scroll-to-id). If an element with the {position:
  // 'fixed', top: '0px'} computed style properties is found, the scroll
  // position will be offset by that element's height.
  scrollOffsetSelector: '',

  // If a value is provided, it will be used as the default id for the
  // `[data-scroll-to-id]` attribute.
  defaultMainId: '',

  /**
   * Methods.
   */

  // Triggers a pjax transition to the current page, reloading it without
  // destroying the JavaScript runtime and other assets.
  reload: function reload() {
    transitionTo(new Config(location, {
      'data-noscroll': true,
      'data-force-reload': true
    }));
  }
};

// Export in a CommonJS environment, otherwise assign to window.
if (typeof module === 'object' && module !== null && typeof module.exports === 'object' && module.exports !== null) {
  module.exports = pjax;
} else {
  window.simplePjax = pjax;
}

// Current request. Only one can be active at a time.
var currentXhr = null;

// Used to detect useless popstate events.
var lastPathname = '';
var lastQuery = '';
rememberPath();

var attrNames = ['data-noscroll', 'data-force-reload', 'data-scroll-to-id'];

// Configuration object for interfacing between anchors, `location`, and
// programmatic triggers.
function Config(urlUtil, attrs) {
  var _this = this;

  this.href = '';
  this.host = '';
  this.hash = '';
  this.pathname = '';
  this.path = '';
  this.protocol = '';
  this.search = '';
  this.isPush = false;
  this.rafId = 0;

  // Copy main attributes.
  Object.keys(this).forEach(function (key) {
    if (key in urlUtil) _this[key] = urlUtil[key];
  });

  // Define path.
  this.path = this.protocol + '//' + this.host + this.pathname;

  // Copy attributes, if applicable.
  if (urlUtil instanceof HTMLElement) {
    attrNames.forEach(function (name) {
      if (urlUtil.hasAttribute(name)) {
        _this[name] = urlUtil.getAttribute(name);
      }
    });
  }

  // Add any additionally passed attributes.
  if (attrs) {
    Object.keys(attrs).forEach(function (key) {
      _this[key] = attrs[key];
    });
  }
}

// Main listener.
document.addEventListener('click', function (event) {
  // No-op if pjax is disabled.
  if (pjax.disabled) return;

  // Find a clicked <a>. No-op if no anchor is available.
  var anchor = event.target;
  do {
    if (anchor instanceof HTMLAnchorElement) break;
  } while (anchor = anchor.parentElement);
  if (!anchor) return;

  // Ignore modified clicks.
  if (event.button !== 0) return;
  if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;

  // Ignore links to other sites.
  if (anchor.protocol + '//' + anchor.host !== location.origin) return;

  // Ignore links intended to affet other tabs or windows.
  if (anchor.target === '_blank' || anchor.target === '_top') return;

  // Ignore links with the data-no-pjax attribute.
  if (anchor.hasAttribute('data-no-pjax')) return;

  // Ignore hash links on the same page if `pjax.scrollOffsetSelector` is
  // unspecified.
  if (anchor.pathname === location.pathname && anchor.hash && !pjax.scrollOffsetSelector) {
    return;
  }

  // Load clicked link.
  event.preventDefault();
  transitionTo(new Config(anchor, { isPush: true }));
});

window.addEventListener('popstate', function (event) {
  // Ignore useless popstate events. This includes initial popstate in Webkit
  // (not in Blink), and popstate on hash changes. Note that we ignore hash
  // changes by not remembering or comparing the hash at all.
  if (pathUnchanged()) return;
  rememberPath();

  /*
   * After a popstate event, Blink/Webkit (what about Edge?) restore the
   * last scroll position the browser remembers for that history entry.
   * Because our XHR is asynchronous and there's a delay before replacing the
   * document, this causes the page to jump around. To prevent that, we
   * artificially readjust the scroll position. If the XHR is finished before
   * the next frame runs, we cancel the task.
   *
   * Webkit (Safari) does receive the correct scroll values, but the page still
   * jumps around. TODO look for a workaround.
   *
   * Unfortunately FF restores the scroll position _before_ firing popstate
   * (which is spec-compliant), so the page still jumps around. To work around
   * this, we would have to listen to scroll events on window and continuously
   * memorize the last scroll position; I'm going to leave the FF behaviour
   * as-is until a better workaround comes up.
   *
   * The FF problem might fix itself:
   *   https://bugzilla.mozilla.org/show_bug.cgi?id=1186774
   *   https://github.com/whatwg/html/issues/39
   */

  var currentX = window.scrollX;
  var currentY = window.scrollY;
  var rafId = requestAnimationFrame(function () {
    window.scrollTo(currentX, currentY);
  });

  transitionTo(new Config(location, { rafId: rafId }));
});

function transitionTo(config) {
  // Special behaviour if this is a push transition within one page. If it leads
  // to a hash target, try to scroll to it. Pjax is not performed.
  var path = location.protocol + '//' + location.host + location.pathname;

  if (config.isPush && config.path === path && config.search === location.search && !('data-force-reload' in config)) {
    // Change the URL and history, if applicable. This needs to be done before
    // changing the scroll position in order to let the browser correctly
    // remember the current position.
    if (config.href !== location.href) {
      history.pushState(null, document.title, config.href);
      rememberPath();
    }

    if (config.hash) {
      // Hash found: try to scroll to it.
      var target = document.querySelector(config.hash);
      if (target instanceof HTMLElement) {
        target.scrollIntoView();
        offsetScroll();
      }
    }

    return;
  }

  // No-op if a request is currently in progress.
  if (currentXhr) return;

  var xhr = currentXhr = new XMLHttpRequest();

  xhr.onload = function () {
    if (xhr.status < 200 || xhr.status > 299) {
      xhr.onerror(null);
      return;
    }

    // Cancel the scroll readjustment, if any. If it has already run, this
    // should have no effect.
    if (config.rafId) cancelAnimationFrame(config.rafId);

    currentXhr = null;
    var newDocument = getDocument(xhr);

    if (!newDocument) {
      xhr.onerror(null);
      return;
    }

    if (config.isPush) {
      var replacementHref = xhr.responseURL && xhr.responseURL !== config.path ? xhr.responseURL : config.href;
      history.pushState(null, newDocument.title, replacementHref);
      rememberPath();
    }

    /*
     * Workaround for a Safari glitch. In Safari, if the document has been
     * scrolled down by the user before the transition, and if it has any
     * fixed-positioned elements, these elements will jump around for a
     * moment after completing a pjax transition. This happens if we only
     * scroll _after_ replacing the document. To avoid this, we basically
     * have to scroll twice: before and after the transition. This doesn't
     * eliminate the problem, but makes it less frequent.
     *
     * Safari truly is the new IE.
     */

    var noScroll = ('data-noscroll' in config);
    var targetId = location.hash ? location.hash.slice(1) : null;
    if (!targetId && config.isPush && 'data-scroll-to-id' in config) {
      targetId = config['data-scroll-to-id'] || pjax.defaultMainId;
    }

    // First scroll: before the transition.
    var target = document.getElementById(targetId);
    if (target) {
      target.scrollIntoView();
      offsetScroll();
    } else if (!targetId && !noScroll) {
      window.scrollTo(0, 0);
    }

    // Hook for scripts to clean up before the transition.
    document.dispatchEvent(createEvent('simple-pjax-before-transition'));

    // Switch to the new document.
    replaceDocument(newDocument);
    indicateLoadEnd();

    // Provide a hook for scripts that may want to run when the document
    // is loaded.
    document.dispatchEvent(createEvent('simple-pjax-after-transition'));

    // Second scroll: after the transition.
    target = document.getElementById(targetId);
    if (target) {
      target.scrollIntoView();
      offsetScroll();
    } else if (!noScroll) {
      window.scrollTo(0, 0);
    }
  };

  xhr.onabort = xhr.onerror = xhr.ontimeout = function () {
    currentXhr = null;
    if (config.isPush) history.pushState(null, '', xhr.responseURL || config.href);
    location.reload();
  };

  xhr.open('GET', config.href);
  // IE compat: responseType must be set after opening the request.
  xhr.responseType = 'document';
  xhr.send(null);

  indicateLoadStart(xhr);
}

function indicateLoadStart(xhr) {
  if (pjax.loadIndicatorDelay > 0) {
    (function () {
      var id = setTimeout(function () {
        if (xhr.readyState === 4) {
          clearTimeout(id);
          return;
        }
        if (typeof pjax.onIndicateLoadStart === 'function') {
          pjax.onIndicateLoadStart();
        }
      }, pjax.loadIndicatorDelay);
    })();
  }
}

function indicateLoadEnd() {
  if (pjax.loadIndicatorDelay > 0 && typeof pjax.onIndicateLoadEnd === 'function') {
    pjax.onIndicateLoadEnd();
  }
}

// TODO test in Opera.
function getDocument(xhr) {
  var type = xhr.getResponseHeader('Content-Type') || 'text/html';
  // Ignore non-HTML resources, such as XML or plan text.
  if (!/html/.test(type)) return null;
  if (xhr.responseXML) return xhr.responseXML;
  return new DOMParser().parseFromString(xhr.responseText, 'text/html');
}

function replaceDocument(doc) {
  // Replace the `title` as the only user-visible part of the head. Assume
  // resource links, `<base>`, and other meaningful metadata to be identical.
  document.title = doc.title;

  // Remove all scripts from the current `<head>` to ensure consistent state.
  [].slice.call(document.head.querySelectorAll('script')).forEach(function (script) {
    script.parentNode.removeChild(script);
  });

  // Remove all `src` scripts under the assumption that they're the same on all
  // pages.
  removeScriptsWithSrc(doc);

  // Replace the body.
  document.body = doc.body;

  // Execute inline scripts found in the new document. Creating copies and
  // adding them to the DOM (instead of using `new Function(...)()` to eval)
  // should allow custom script types to work (TODO test). We leave the original
  // scripts in the DOM to preserve the behaviour of scripts that target
  // themselves by `id` to be replaced with a widget (common strategy for iframe
  // embeds).
  [].slice.call(document.scripts).forEach(function (script) {
    document.body.appendChild(copyScript(script));
  });
}

function removeScriptsWithSrc(doc) {
  [].slice.call(doc.scripts).forEach(function (script) {
    if (!!script.src && !!script.parentNode) {
      script.parentNode.removeChild(script);
    }
  });
}

// Creates an incomplete copy of the given script that inherits only type and
// content from the original. Other attributes such as `id` are not copied in
// order to preserve the behaviour of scripts that target themselves by `id` to
// be replaced with a widget. If the script potentially destroys the document
// through a `document.write` or `document.open` call, a dummy is returned.
function copyScript(originalScript) {
  var script = document.createElement('script');
  if (!destroysDocument(originalScript.textContent)) {
    if (originalScript.type) script.type = originalScript.type;
    script.textContent = originalScript.textContent;
  }
  return script;
}

// Very primitive check if the given script contains calls that potentially
// erase the document's contents.
function destroysDocument(script) {
  return (/document\s*\.\s*(?:write|open)\s*\(/.test(script)
  );
}

// Used with each `history.pushState` call to help us discard redundant popstate
// events.
function rememberPath() {
  lastPathname = location.pathname;
  lastQuery = location.search;
}

function pathUnchanged() {
  return location.pathname === lastPathname && location.search === lastQuery;
}

// IE compat: IE doesn't support dispatching events created with constructors,
// at least not for document.dispatchEvent.
function createEvent(name) {
  var event = document.createEvent('Event');
  event.initEvent(name, true, true);
  return event;
}

// See pjax.scrollOffsetSelector.
function offsetScroll() {
  if (pjax.scrollOffsetSelector) {
    var elem = document.querySelector(pjax.scrollOffsetSelector);
    var style = getComputedStyle(elem);
    if (style.position === 'fixed' && style.top === '0px') {
      window.scrollBy(0, -elem.getBoundingClientRect().height);
    }
  }
}

}();