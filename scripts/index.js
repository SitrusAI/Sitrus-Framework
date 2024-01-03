// version 1.5
var comp = {};
var app = {};

async function initData() {
  console.log('initData()');
  app = await fetchData('/data/locale/en/common.json');
  // app = await fetchData('/data/en-property.json');
}

async function initRoutes() {
  try {
    // page data has routes information
    const response = await fetch('/pages/pages.json');
    if (!response.ok) return {};
    const data = await response.json();

    let routes = {
      "active": {},
    };
    for (const page in data.pages) {
      if (data.pages[page].active) {
        data.pages[page].routes.forEach(route => {
          routes.active[route] = data.pages[page].file;
        });
      }
      if (page === data.index) routes.index = data.pages[page].routes[0];
    }
    return routes;
  } catch (error) {
    console.error('Failed to load routes', error);
    return {};
  }
}

async function router() {
  // init data first
  if (!app || typeof app !== 'object' || Object.keys(DATA).length < 1) await initData();
  // load routes from json
  const routes = await initRoutes();
  // console.dir('routes', routes);

  // get the current path (excluding the domain)
  let path = window.location.pathname;
  // window.location.hostname -> contains ONLY the subdomain.domain.com portion.
  // window.location.pathname -> contains ONLY the /path, no fragments or query strings
  // window.location.hash   -> contains the fragment, ie '#mobile-menu'
  // window.location.search -> contains the query strings, ie '?key=value&key2=value2'
  // console.log('path', path);

  if (path === '/') {
    // if there is no index defined in the routes, then need to load content of index.html
    if (!routes.index) return; // prevent router from routing
    // apply default index
    path = `/${routes.index}`;
    // history.pushState({}, 'Index', path); // no redirect
  }

  // chop path into segments, omitting empty ones
  const pathSegments = path.split('/').filter(segment => segment.length);

  // match the path to a route
  // const matchedRoute = matchRoute(pathSegments, routes);
  for (let route in routes.active) {
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
      return loadContent({
          url: routes.active[route],
          params
        })
        .then((params) => {
          unloadContent();
          if (typeof page_init === 'function') page_init(params);
        });
    }
  }
  // could not route request path
  // show a default page or error handling here
  return null;
}

async function loadContent({ url,params }) {
  return new Promise(async (resolve, reject) => {
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
      document.body.parentNode.replaceChild(pageDoc.body, document.body);

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

      // trigger anchor if any
      // note: to check if there is no fragment, look for an empty string
      // if (window.location.hash === '') {}
      const anchor = window.location.hash.substr(1);
      if (anchor) {
        const element = document.getElementById(anchor);
        if (element) {
          element.scrollIntoView();
        }
      }
      return resolve(params);
    } catch (error) {
      console.error(error);
      return resolve(params);
    }
  });
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
  resetPageData();
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

async function fetchData(json) {
  try {
    const response = await fetch(json);
    if (!response.ok) return {};
    const data = await response.json();
    return data;
  } catch (error) {
    return {};
  }
}

function resetPageData() {
  console.log('resetPageData');
  let page = {
    loaded: false,
    params: {},
  };
  Alpine.store('SITRUS').page = page;
}

document.addEventListener('alpine:init', () => {
  console.log('Alpine INIT');
  Alpine.store('SITRUS', {
    dash: {
      processing: false,
      fetched: false,
      task: {},
    },
    page: {
      loaded: false,
      params: {},
    },
    ping: 'pong'
  });
});

document.addEventListener('DOMContentLoaded', () => {
  router();
});

window.addEventListener('popstate', function (event) {
  console.log('POPSTATE CHANGE');
  // browser back-forward buttons pushed [or history.back() / history.forward()]
  // call router again to display correct content
  // - the address bar will have been updated already, no need to track
  router();
});

// todo:
// const observer = new MutationObserver(mutations => {
//   mutations.forEach(mutation => {
//     if (mutation.addedNodes.length) {
//       // Handle the added nodes
//     }
//   });
// });
// observer.observe(document.body, { childList: true, subtree: true });
