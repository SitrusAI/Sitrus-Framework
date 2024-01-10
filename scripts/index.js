// version 0
var sitrus={};
var ready = {
  alpine: false,
  sitrus: false,
};

async function launch() {
  try {
    // pull and parse sitrus app config
    const response = await fetch('/content.json');
    if (!response.ok) return;
    sitrus.config = await response.json();

    // lang
    sitrus.lang = {
      locale: sitrus.config.lang.default,
    };
    if (sitrus.config.lang.defaultToBrowser) {
      let locale = checkLocale(navigator.language);
      if (locale) sitrus.lang.locale = locale;
    }
    sitrus.lang.prefix = '';
    if (sitrus.config.lang.locales.length > 1) sitrus.lang.prefix = `${sitrus.lang.locale}-`;

    // load shared cms
    sitrus.cms = {};
    for (const filename of sitrus.config.cms.files) {
      const cms = await fetchCms(`${sitrus.lang.prefix}${filename}`);
      if (!cms) return; // continue
      // todo: support .md files
      const {name} = chopFilename(filename);
      sitrus.cms[name] = cms;
    };

    // process routes
    sitrus.path = '';
    sitrus.routes = {};
    Object.entries(sitrus.config.pages.active).forEach(([name, page]) => {
      page.routes.forEach(route => {
        sitrus.routes[route.path] = {};
        sitrus.routes[route.path].name = name;
        sitrus.routes[route.path].file = page.file;
        if (route.cms && route.prop) {
          sitrus.routes[route.path].cms = route.cms;
          sitrus.routes[route.path].prop = route.prop;
        }
      });
      if (name === sitrus.config.pages.index) sitrus.routes.index = page.routes[0].path;
    });
    document.dispatchEvent(launchEvent);
  } catch (error) {
    console.error('Failure to launch!', error);
  }
}

async function router() {
  await Alpine.store('app').load();
  // get the current path (excluding the domain)
  let path = window.location.pathname;
  let hash = window.location.hash;
  // window.location.hostname -> contains ONLY the subdomain.domain.com portion.
  // window.location.pathname -> contains ONLY the /path, no fragments or query strings
  // window.location.hash   -> contains the fragment, ie '#mobile-menu'
  // window.location.search -> contains the query strings, ie '?key=value&key2=value2'
  // console.log('path', path);

  if (path === '/') {
    // if there is no index defined in the routes, then need to load content of index.html
    if (!sitrus.routes.index) return; // prevent router from routing
    // apply default index
    path = `/${sitrus.routes.index}`;
    // history.pushState({}, 'Index', path); // no redirect
  }

  // chop path into segments, omitting empty ones
  const pathSegments = path.split('/').filter(segment => segment.length);

  // match the path to a route
  // const matchedRoute = matchRoute(pathSegments, sitrus.routes);
  for (let route in sitrus.routes) {
    // console.log('route',route); // path not object
    const routeSegments = route.split('/').filter(segment => segment.length);
    // disqualify based on number of segmants
    if (routeSegments.length !== pathSegments.length) {
      continue;
    }

    const params = {};
    // iterate every segment of the route until false is encountered,
    // in which case move onto the next route and repeat
    // if all returned true, then we do have a match
    const match = routeSegments.every((segment, i) => {
      if (segment.startsWith(':')) {
        params[segment.slice(1)] = pathSegments[i];
        return true;
      }
      return segment === pathSegments[i];
    });

    if (match) {
      // no (re)load: hash at current route
      if (sitrus.path === window.location.pathname && hash) {
        const el = document.getElementById(hash.substring(1));
        if (el) el.scrollIntoView();
        return;
      }
      // end of no (re)load

      // save path
      sitrus.path = path;
      // ex. sitrus.routes['product/:id']
      await Alpine.store('app').setRoute(sitrus.routes[route],params);
      await loadContent({
        url: sitrus.routes[route].file,
        params
      });
      if (hash) {
        const el = document.getElementById(hash.substring(1));
        if (el) el.scrollIntoView();
      } else {
        window.scrollTo(0,0);
      }
      await unloadContent();
      if (typeof page_init === 'function') page_init(params);
    }
  }
  // could not route request path
  // show a default page or error handling here
  return null;
}

async function loadContent({ url,params }) {
  try {
    console.log('LOAD CONTENT', url);
    const response = await fetch(url);
    const html = await response.text();

    // console.log('html', html);

    const parser = new DOMParser();
    const pageDoc = parser.parseFromString(html, 'text/html');

    // reset head meta
    resetHead();
    let unloads = document.querySelectorAll('.load-cont');
    for (let el of unloads) {
      el.parentNode.removeChild(el);
    }

    // todo: replace any DOMContentLoaded listeners with event that we can fire

    // Add/Update head with incoming elements
    const pageHeadTags = Array.from(pageDoc.head.children);
    for (let el of pageHeadTags) {
      console.dir(el);
      if (el.localName === 'base') {
        let base = document.head.querySelector('base');
        if (base) base.setAttribute('href', el.getAttribute('href'));
      } else if (el.localName === 'meta') {
        // meta tags do not support classes, nor onload/onerror
        switch (el.name) {
          case 'author':
          case 'description':
          case 'keywords':
          case 'viewport':
            let meta = document.head.querySelector(`meta[name="${el.name}"]`);
            if (meta) meta.setAttribute('content', el.getAttribute('content'));
            break;
          default:
            if (el.hasAttribute('charset')) {
              let charset = document.head.querySelector('meta[charset]');
              charset.setAttribute('charset', el.getAttribute('charset'));
            }
            break;
        }
      } else if (el.localName === 'title') {
        document.title = el.textContent;
      } else if (el.localName === 'link' && el.rel === 'stylesheet') {
        await loadCSS(el.getAttribute('href'));
      } else if (el.localName === 'script') {
        let src = el.getAttribute('src');
        // console.log(`script: ${src}`);
        if (src) {
          await loadJS(src);
        } else {
          loadScript(el.text);
        }
      } else if (el.localName === 'style') {
        // meta tags do not support classes, nor onload/onerror
        loadStyle(el.textContent);
      }
      // else do nothing
    };

    // copy and remove body scripts
    const incomingScripts = pageDoc.body.querySelectorAll('script');
    const copiedScripts = [];

    for (let script of incomingScripts) {
      const copiedScript = script.cloneNode(true);
      copiedScripts.push(copiedScript);
      script.remove(); // remove original by reference
    };


    // overwrite body content, without the scripts
    // document.body.parentNode.replaceChild(pageDoc.body, document.body); // vui incompatible
    // Alpine.store('app').body = pageDoc.body.innerHTML; // deprecated

    // vui requires imports to be loaded per page
    const ximports = pageDoc.body.getAttribute('x-import');
    console.log('body',pageDoc.body,ximports);
    // if (ximports) document.body.setAttribute('x-import', ximports);
    // $vui.setHtml(document.body, pageDoc.body.innerHTML);

    const xbody = document.getElementById('xbody');
    $vui.$api(xbody).content = pageDoc.body.innerHTML;
    $vui.$api(xbody).imports = ximports;


    // re-initialize the body scripts, into the head
    for (let script of copiedScripts) {
      let src = script.getAttribute('src');
      if (src) {
        await loadJS(src);
      } else {
        loadScript(script.text);
      }
    };

    // theme switching
    if (typeof themeChange === 'function') {
      themeChange(false);
    }
  } catch (error) {
    console.error(error);
  }
}

async function unloadContent() {
  console.log('UNLOAD CONTENT');
  // remove elements previously loaded
  let unloads = document.querySelectorAll('.unload-cont');
  for (let el of unloads) {
    el.parentNode.removeChild(el);
  }
  // reassign class of newly loaded
  let elements = document.querySelectorAll('.load-cont');
  for (let el of unloads) {
    el.className = 'unload-cont';
  }
  // reset page data (Alpine)
  // resetPageData();
}

// tools
function checkLocale(locale) {
  console.log('processing locale', locale);
  if (locale.length === 2) return locale;
  if (locale.length > 2 && locale[2] === '-') return locale.substring(0, 2);
  return false;
}
function getFileExt(filename) {
  if (!filename) return false;
  // regex - doesnt work on .gitignore etc
  const re = /(?:\.([^.]+))?$/;
  const ext = re.exec(filename)[1]; // [1] accesses the first captured group
  return ext ? ext : '';
}
function chopFilename(filename) {
  if (!filename) return false;
  const dot = filename.lastIndexOf('.');
  // if no or starting dot
  if (dot === -1 || dot === 0) {
      return { name: filename, ext: null };
  }
  // extract
  const name = filename.substring(0, dot);
  const ext = filename.substring(dot + 1);
  //
  return { name, ext };
}
async function fetchCms(filename) {
  if (!filename) return false;
  if (!sitrus.lang.locale) return false;
  const cms = `${sitrus.config.cms.path}${sitrus.lang.prefix}${filename}`;
  try {
    const resp = await fetch(cms);
    if (!resp.ok) {
      console.log('failure pulling cms');
      return false;
    }
    const ext = getFileExt(filename);
    // todo: potentially fallback on content-type (application/json, text/markdown, text/plain)
    const data = (ext === 'json') ? await resp.json() : await resp.text();
    // console.log('cms', data);
    return data;
  } catch (error) {
    console.log('error pulling cms');
    return false;
  }
}
function loadCSS(href) {
  return new Promise(function (resolve, reject) {
    if (!href) return reject();
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = href;
    link.className = 'load-cont'
    link.onload = () => resolve('loaded');
    link.onerror = () => reject();
    document.head.appendChild(link);
  });
}
// for style tags (has no onload/onerror events)
function loadStyle(css) {
  if (!css) return;
  const style = document.createElement('style');
  style.className = 'load-cont';
  style.textContent = css;
  document.head.appendChild(style);
}
function loadJS(src) {
  return new Promise(function (resolve, reject) {
    // console.log('loadJS', src);
    if (!src) return reject();
    const script = document.createElement('script');
    script.src = src;
    // script.defer = true;
    script.className = 'load-cont';
    script.onload = () => resolve('loaded');
    script.onerror = () => reject();
    document.head.appendChild(script);
  });
}
// for script tags without src (has no onload/onerror events)
function loadScript(code) {
  if (!code) return;
  const script = document.createElement('script');
  script.className = 'load-cont';
  script.text = code;
  // script.defer = true;
  document.head.appendChild(script);
}

function resetHead() {
  let base = document.head.querySelector('base');
  if (base) base.setAttribute('href', '/');

  let charset = document.head.querySelector('meta[charset]');
  if (charset) charset.setAttribute('charset', 'utf-8');

  let viewport = document.head.querySelector('meta[name="viewport"]');
  if (viewport) viewport.setAttribute('content', 'width=device-width, initial-scale=1.0, viewport-fit=cover');

  let author = document.head.querySelector('meta[name="author"]');
  if (author) author.setAttribute('content', '');

  let description = document.head.querySelector('meta[name="description"]');
  if (description) description.setAttribute('content', '');

  // let keywords = document.head.querySelector('meta[name="keywords"]');
  // keywords.setAttribute('content', '');

  // let favicon = document.head.querySelector('link[rel="icon"]');
  // favicon.setAttribute('href', '/favicon.ico');
  // favicon.setAttribute('type', 'image/x-icon');
}

// events & stores
document.addEventListener('alpine:init', () => {
  console.log('alpine:init');

  Alpine.store('app', {
    loaded: false,
    body: '',
    cms: {},
    lang: {
      locale: '',
      prefix: '',
    },
    route: {},
    params: {},
    async load() {
      if (this.loaded) return;
      // lang
      this.lang.locale = sitrus.lang.locale;
      this.lang.prefix = sitrus.lang.prefix;
      //
      this.loaded = true;
    },
    async setRoute(route,params) {
      if (!route || typeof route !== 'object') return;
      this.route = route;
      // handle params
      if (!params || typeof params !== 'object') params = {};
      this.params = params;

      // reset shared cms
      this.cms = sitrus.cms;
      // load page-level cms
      for (const filename of sitrus.config.pages.active[this.route.name].cms) {
        const cms = await fetchCms(`${this.lang.prefix}${filename}`);
        if (!cms) return; // continue
        // todo: support .md files
        const {name} = chopFilename(filename);
        this.cms[name] = cms;
      };
      // isolate if any
      if (this.params.cms && this.route.cms && this.route.prop) {
        let isolated = this.getCms(this.cms, this.route.cms, this.params.cms);
        if (isolated) this.cms[this.route.prop] = isolated;
        // console.log('isolate cms', isolated);
      }
    },
    getCms(cms, path, value) {
      const pathParts = path.split('.');
      let current = cms;

      for (const part of pathParts) {
        if (Array.isArray(current)) {
          current = current.flatMap(item => item[part] || []);
        } else if (current[part]) {
          current = current[part];
        } else {
          return null; // Path not found
        }
        // search array
        if (Array.isArray(current)) {
          const found = current.find(item => item[pathParts[pathParts.length - 1]] === value);
          if (found) return found;
        }
      }
      return null;
    },
    ping: 'pong'
  });

  //
  Alpine.store('colors', {
    refresh() {
      if (typeof themeChange === 'function') {
        console.log('re-init colors');
        themeChange(false);
      }
    }
  });
});

document.addEventListener('alpine:initialized', () => {
  console.log('ready: alpine');
  ready.alpine = true;
});

document.addEventListener('DOMContentLoaded', () => {
  
});

document.addEventListener('click', function(e) {
  let el = e.target;
  // anchor might be wrapped around child element that was clicked
  // need to traverse parents until anchor is found
  while (el && el.tagName !== 'A') {
    el = el.parentNode;
  }
  // anchor found?
  if (el && el.tagName === 'A') {
    const href = el.getAttribute('href');
    if (href.startsWith('/')) {
      e.preventDefault();
      history.pushState({}, '', href); // no page reload
      router();
    } else if (href.startsWith('#')) {
      e.preventDefault();
      history.replaceState({}, '', `${window.location.pathname}${href}`); // no page reload
      router();
    }
  }
});
window.addEventListener('popstate', function (event) {
  // browser back-forward buttons pushed [or history.back() / history.forward()]
  // address bar will have been updated already, no need to track
  router();
});

let launchEvent = new CustomEvent('sitrus', {
  detail: {},
  bubbles: true,
  cancelable: true
});
document.addEventListener('sitrus', function (e) {
  console.log('ready:sitrus');
  ready.sitrus = true;
  if (ready.sitrus && ready.alpine) return router();
  // else
  let rep = setInterval(function () {
    console.log('ready check', ready.sitrus, ready.alpine);
    if (ready.sitrus && ready.alpine) {
      router();
      clearInterval(rep);
    }
  }, 500);
});
launch();

// todo:
// const observer = new MutationObserver(mutations => {
//   mutations.forEach(mutation => {
//     if (mutation.addedNodes.length) {
//       // Handle the added nodes
//     }
//   });
// });
// observer.observe(document.body, { childList: true, subtree: true });

// old:
function resetHeadOld() {
  let head = {};
  head['base'] = document.head.querySelector('base');
  if (head['base']) {
    head['base'].setAttribute('href', '/');
  } else {
    head['base'] = document.createElement('base');
    head['base'].setAttribute('href', '/');
    document.head.appendChild(head['base']);
  }
  //
  head['charset'] = document.head.querySelector('meta[charset]');
  if (head['charset']) {
    head['charset'].setAttribute('charset', 'utf-8');
  } else {
    head['charset'] = document.createElement('meta');
    head['charset'].setAttribute('charset', 'utf-8');
    document.head.appendChild(head['charset']);
  }
  //
  head['viewport'] = document.head.querySelector('meta[name="viewport"]');
  if (head['viewport']) {
    head['viewport'].setAttribute('content', 'width=device-width, initial-scale=1.0, viewport-fit=cover');
  } else {
    head['viewport'] = document.createElement('meta');
    head['viewport'].setAttribute('name', 'viewport');
    head['viewport'].setAttribute('content', 'width=device-width, initial-scale=1.0, viewport-fit=cover');
    document.head.appendChild(head['viewport']);
  }
  //
  head['author'] = document.head.querySelector('meta[name="author"]');
  if (head['author']) {
    head['author'].setAttribute('content', '');
  } else {
    head['author'] = document.createElement('meta');
    head['author'].setAttribute('name', 'author');
    head['author'].setAttribute('content', '');
    document.head.appendChild(head['author']);
  }
  //
  head['description'] = document.head.querySelector('meta[name="description"]');
  if (head['description']) {
    head['description'].setAttribute('content', '');
  } else {
    head['description'] = document.createElement('meta');
    head['description'].setAttribute('name', 'description');
    head['description'].setAttribute('content', '');
    document.head.appendChild(head['description']);
  }
  //
  // head['keywords'] = document.head.querySelector('meta[name="keywords"]');
  // if (head['keywords']) {
  //   head['keywords'].setAttribute('content', '');
  // } else {
  //   head['keywords'] = document.createElement('meta');
  //   head['keywords'].setAttribute('name', 'keywords');
  //   head['keywords'].setAttribute('content', '');
  //   document.head.appendChild(head['keywords']);
  // }
  //
  // head['favicon'] = document.querySelector('link[rel="icon"]');
  // if (head['favicon']) {
  //  head['favicon'].setAttribute('href', '/favicon.ico');
  // } else {
  //  head['favicon'] = document.createElement('link');
  //  head['favicon'].setAttribute('type', 'image/x-icon');
  //  head['favicon'].setAttribute('href', '/favicon.ico');
  //  document.head.appendChild(head['']);
  // }
  //
  return head;
}

// function resetPageData() {
//   console.log('resetPageData');
//   let page = {
//     loaded: false,
//     params: {},
//   };
//   Alpine.store('app').page = page;
// }