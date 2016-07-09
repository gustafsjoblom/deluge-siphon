(function(window, document){
  var CONTROL_KEY = 17,
      RIGHT_CLICK = 2,
      CONTROL_KEY_DEPRESSED = false,
      SITE_META = {
        DOMAIN: window.location.host,
        TORRENT_REGEX: '\\.torrent',
        TORRENT_URL_ATTRIBUTE: 'href',
        INSTALLED: false
      },
      listeners = {};

  function extract_torrent_url(e, site_meta){
    var element,
        torrent_match,
        torrent_url,
        attr = site_meta.TORRENT_URL_ATTRIBUTE,
        regex = new RegExp(site_meta.TORRENT_REGEX);

    if (getAttr(e.target, attr)) element = e.target;
    if (!getAttr(element, attr)) element = getChildElementByName('a', e.target);
    if (!getAttr(element, attr)) element = getParentElementByName('a', e.target);
    var val = getAttr(element, attr);
    if (val) torrent_match = val.match(regex);

    if (torrent_match) {
      // for vanilla sites just return the whole matching string...
      torrent_url = torrent_match.input;
    }
    return torrent_url;
  }

  function process_event(e){
    //process the event and if possible, sends the extracted link to the controller
    var torrent_url = extract_torrent_url(e, SITE_META);
    if  (torrent_url) {
      stopEvent(e);
      //console.log('addlink', torrent_url, SITE_META.DOMAIN);
      chrome.runtime.sendMessage(chrome.runtime.id, {
        method:'addlink-todeluge', url:torrent_url, domain: SITE_META.DOMAIN
      });
    }
  }

  function handle_keydown(e) {
    if (e.keyCode === CONTROL_KEY) CONTROL_KEY_DEPRESSED = true;
  }

  function handle_keyup(e) {
    if (e.keyCode === CONTROL_KEY) CONTROL_KEY_DEPRESSED = false;
  }

  function handle_rightclick_for_macro(e) {
    // handles the original control + rightclick macro
    if (CONTROL_KEY_DEPRESSED) process_event(e);
  }

  function handle_rightclick_for_contextmenu(e) {
      // some sites, like TVT, add links via javascript and other complex methods.
      // chrome's contextmenu API however, does not provide access to the dom, therefore
      // we need to capture what we need from here and kick it to the backend where the
      // contextmenu function can retrieve it out of localstorage...

      var torrent_url = extract_torrent_url(e, SITE_META);
      if  (torrent_url) {
        chrome.runtme.sendMessage(chrome.runtime.id, {
          method: "storage-set-site_current_url_" + SITE_META.DOMAIN, value: torrent_url
        });
      }
  }

  function handle_leftclick(e) {
    process_event(e);
  }

  function handle_visibilityChange() {
    if (! document.webkitHidden && document.webkitVisibilityState != 'prerender') {
      site_init();
      // check if settings have changed and adjust handlers accordingly
      install_configurable_handlers();
    }
  }

  function install_configurable_handlers(){
    /*
      so, this provides a rudimentary event
      handler registry.  Following this pattern
      lets us turn the event handlers on and off on the
      fly based on a users settings.  Without it they'd
      have to refresh any open tabs after a config change.

      TODO: functionalize setup and teardown of listeners;
      this isn't DRY..
    */

    /* install control + rightclick keyboard macro */
    chrome.runtime.sendMessage(chrome.runtime.id, {
      method: "storage-get-enable_keyboard_macro"
    }, {}, function(response) {
      if ( response.value ) {
        // if "control + right click" macro enabled
        if (! listeners.keydown) {
          listeners.keydown = handle_keydown;
          document.addEventListener('keydown', handle_keydown,false);
        }

        if (! listeners.keyup) {
          listeners.keyup = handle_keyup;
          document.addEventListener('keyup', handle_keyup,false);
        }

        // contextmenu event is just generic rightclick..
        if (! listeners.contextmenu)  {
          document.addEventListener('contextmenu', handle_rightclick_for_macro, false);
          listeners.contextmenu = handle_rightclick_for_macro;
        }

      } else {
        // it may have been turned off in settings, so remove if it exists.
        if (listeners.keydown) {
          document.removeEventListener('keydown', listeners.keydown);
          listeners.keydown = null;
        }

        if (listeners.keyup) {
          document.removeEventListener('keyup', listeners.keyup);
          listeners.keyup = null;
        }

        if (listeners.contextmenu) {
          document.removeEventListener('contextmenu', listeners.contextmenu);
          listeners.contextmenu = null;
        }

        if (listeners.contextmenu_helper) {
          document.removeEventListener('contextmenu', listeners.contextmenu_helper);
          listeners.contextmenu_helper = null;
        }
      }
    });

    /* install leftclick handling */
    chrome.runtime.sendMessage(chrome.runtime.id, {
      method: "storage-get-enable_leftclick"
    }, {}, function(response) {
      if (response.value) {
        if (! listeners.click) {
          document.body.addEventListener('click', handle_leftclick, false);
          listeners.click = handle_leftclick;
        }
      } else {
        if (listeners.click) {
          // it has been turned off in settings, so remove if it exists.
          document.body.removeEventListener('click', listeners.click);
          listeners.click = null;
        }
        if (listeners.mutation){
          // TODO: we can turn off our mutation listener, but we still need to remove all
          // the "return false's; we had to force into the onclick handlers to resume
          // normal functionality.
          // TVTunblockLoadTorrent();
          listeners.mutation.disconnect();
          listeners.mutation = null;
        }
      }
    });
  }

  function site_init(){
    /*
      This function identifies the site and sets up things like the regex
      needed to parse for torrent hrefs, or other more site-specific requirements
      such as tvtorrent's additional hash and digest info.
    */

    /* get regex for link checking from settings */
    chrome.runtime.sendMessage(chrome.runtime.id, {
      method: 'storage-get-link_regex'
    }, {}, function(response){
      SITE_META.TORRENT_REGEX = response.value;
    });
  } /* end site_init */

  // initialize once, then
  handle_visibilityChange();

  // watch for tab changes
  if (! listeners.webkitvisibilitychange) {
    document.addEventListener('webkitvisibilitychange', handle_visibilityChange, false);
    listeners.webkitvisibilitychange = handle_visibilityChange;
  }

  SITE_META.INSTALLED = true;
}(window, document));
