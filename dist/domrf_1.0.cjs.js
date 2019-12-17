'use strict';

function noop() { }
function run(fn) {
    return fn();
}
function blank_object() {
    return Object.create(null);
}
function run_all(fns) {
    fns.forEach(run);
}
function is_function(thing) {
    return typeof thing === 'function';
}
function safe_not_equal(a, b) {
    return a != a ? b == b : a !== b || ((a && typeof a === 'object') || typeof a === 'function');
}

function append(target, node) {
    target.appendChild(node);
}
function insert(target, node, anchor) {
    target.insertBefore(node, anchor || null);
}
function detach(node) {
    node.parentNode.removeChild(node);
}
function destroy_each(iterations, detaching) {
    for (let i = 0; i < iterations.length; i += 1) {
        if (iterations[i])
            iterations[i].d(detaching);
    }
}
function element(name) {
    return document.createElement(name);
}
function text(data) {
    return document.createTextNode(data);
}
function space() {
    return text(' ');
}
function empty() {
    return text('');
}
function listen(node, event, handler, options) {
    node.addEventListener(event, handler, options);
    return () => node.removeEventListener(event, handler, options);
}
function attr(node, attribute, value) {
    if (value == null)
        node.removeAttribute(attribute);
    else if (node.getAttribute(attribute) !== value)
        node.setAttribute(attribute, value);
}
function children(element) {
    return Array.from(element.childNodes);
}
function set_data(text, data) {
    data = '' + data;
    if (text.data !== data)
        text.data = data;
}

let current_component;
function set_current_component(component) {
    current_component = component;
}
function get_current_component() {
    if (!current_component)
        throw new Error(`Function called outside component initialization`);
    return current_component;
}
function setContext(key, context) {
    get_current_component().$$.context.set(key, context);
}
function getContext(key) {
    return get_current_component().$$.context.get(key);
}

const dirty_components = [];
const binding_callbacks = [];
const render_callbacks = [];
const flush_callbacks = [];
const resolved_promise = Promise.resolve();
let update_scheduled = false;
function schedule_update() {
    if (!update_scheduled) {
        update_scheduled = true;
        resolved_promise.then(flush);
    }
}
function add_render_callback(fn) {
    render_callbacks.push(fn);
}
function add_flush_callback(fn) {
    flush_callbacks.push(fn);
}
function flush() {
    const seen_callbacks = new Set();
    do {
        // first, call beforeUpdate functions
        // and update components
        while (dirty_components.length) {
            const component = dirty_components.shift();
            set_current_component(component);
            update(component.$$);
        }
        while (binding_callbacks.length)
            binding_callbacks.pop()();
        // then, once components are updated, call
        // afterUpdate functions. This may cause
        // subsequent updates...
        for (let i = 0; i < render_callbacks.length; i += 1) {
            const callback = render_callbacks[i];
            if (!seen_callbacks.has(callback)) {
                callback();
                // ...so guard against infinite loops
                seen_callbacks.add(callback);
            }
        }
        render_callbacks.length = 0;
    } while (dirty_components.length);
    while (flush_callbacks.length) {
        flush_callbacks.pop()();
    }
    update_scheduled = false;
}
function update($$) {
    if ($$.fragment !== null) {
        $$.update();
        run_all($$.before_update);
        $$.fragment && $$.fragment.p($$.ctx, $$.dirty);
        $$.dirty = [-1];
        $$.after_update.forEach(add_render_callback);
    }
}
const outroing = new Set();
let outros;
function group_outros() {
    outros = {
        r: 0,
        c: [],
        p: outros // parent group
    };
}
function check_outros() {
    if (!outros.r) {
        run_all(outros.c);
    }
    outros = outros.p;
}
function transition_in(block, local) {
    if (block && block.i) {
        outroing.delete(block);
        block.i(local);
    }
}
function transition_out(block, local, detach, callback) {
    if (block && block.o) {
        if (outroing.has(block))
            return;
        outroing.add(block);
        outros.c.push(() => {
            outroing.delete(block);
            if (callback) {
                if (detach)
                    block.d(1);
                callback();
            }
        });
        block.o(local);
    }
}

function bind(component, name, callback) {
    const index = component.$$.props[name];
    if (index !== undefined) {
        component.$$.bound[index] = callback;
        callback(component.$$.ctx[index]);
    }
}
function create_component(block) {
    block && block.c();
}
function mount_component(component, target, anchor) {
    const { fragment, on_mount, on_destroy, after_update } = component.$$;
    fragment && fragment.m(target, anchor);
    // onMount happens before the initial afterUpdate
    add_render_callback(() => {
        const new_on_destroy = on_mount.map(run).filter(is_function);
        if (on_destroy) {
            on_destroy.push(...new_on_destroy);
        }
        else {
            // Edge case - component was destroyed immediately,
            // most likely as a result of a binding initialising
            run_all(new_on_destroy);
        }
        component.$$.on_mount = [];
    });
    after_update.forEach(add_render_callback);
}
function destroy_component(component, detaching) {
    const $$ = component.$$;
    if ($$.fragment !== null) {
        run_all($$.on_destroy);
        $$.fragment && $$.fragment.d(detaching);
        // TODO null out other refs, including component.$$ (but need to
        // preserve final state?)
        $$.on_destroy = $$.fragment = null;
        $$.ctx = [];
    }
}
function make_dirty(component, i) {
    if (component.$$.dirty[0] === -1) {
        dirty_components.push(component);
        schedule_update();
        component.$$.dirty.fill(0);
    }
    component.$$.dirty[(i / 31) | 0] |= (1 << (i % 31));
}
function init(component, options, instance, create_fragment, not_equal, props, dirty = [-1]) {
    const parent_component = current_component;
    set_current_component(component);
    const prop_values = options.props || {};
    const $$ = component.$$ = {
        fragment: null,
        ctx: null,
        // state
        props,
        update: noop,
        not_equal,
        bound: blank_object(),
        // lifecycle
        on_mount: [],
        on_destroy: [],
        before_update: [],
        after_update: [],
        context: new Map(parent_component ? parent_component.$$.context : []),
        // everything else
        callbacks: blank_object(),
        dirty
    };
    let ready = false;
    $$.ctx = instance
        ? instance(component, prop_values, (i, ret, value = ret) => {
            if ($$.ctx && not_equal($$.ctx[i], $$.ctx[i] = value)) {
                if ($$.bound[i])
                    $$.bound[i](value);
                if (ready)
                    make_dirty(component, i);
            }
            return ret;
        })
        : [];
    $$.update();
    ready = true;
    run_all($$.before_update);
    // `false` as a special case of no DOM component
    $$.fragment = create_fragment ? create_fragment($$.ctx) : false;
    if (options.target) {
        if (options.hydrate) {
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            $$.fragment && $$.fragment.l(children(options.target));
        }
        else {
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            $$.fragment && $$.fragment.c();
        }
        if (options.intro)
            transition_in(component.$$.fragment);
        mount_component(component, options.target, options.anchor);
        flush();
    }
    set_current_component(parent_component);
}
class SvelteComponent {
    $destroy() {
        destroy_component(this, 1);
        this.$destroy = noop;
    }
    $on(type, callback) {
        const callbacks = (this.$$.callbacks[type] || (this.$$.callbacks[type] = []));
        callbacks.push(callback);
        return () => {
            const index = callbacks.indexOf(callback);
            if (index !== -1)
                callbacks.splice(index, 1);
        };
    }
    $set() {
        // overridden by instance, if it has props
    }
}

function _typeof(obj) {
  if (typeof Symbol === "function" && typeof Symbol.iterator === "symbol") {
    _typeof = function (obj) {
      return typeof obj;
    };
  } else {
    _typeof = function (obj) {
      return obj && typeof Symbol === "function" && obj.constructor === Symbol && obj !== Symbol.prototype ? "symbol" : typeof obj;
    };
  }

  return _typeof(obj);
}

/*jslint plusplus:true */


function Geomag(model) {

  var wmm,
      maxord = 12,
      a = 6378.137,
      // WGS 1984 Equatorial axis (km)
  b = 6356.7523142,
      // WGS 1984 Polar axis (km)
  re = 6371.2,
      a2 = a * a,
      b2 = b * b,
      c2 = a2 - b2,
      a4 = a2 * a2,
      b4 = b2 * b2,
      c4 = a4 - b4,
      z = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      unnormalizedWMM;

  function parseCof(cof) {
    wmm = function (cof) {
      var modelLines = cof.split('\n'),
          wmm = [],
          i,
          vals,
          epoch,
          model,
          modelDate;

      for (i in modelLines) {
        if (modelLines.hasOwnProperty(i)) {
          vals = modelLines[i].replace(/^\s+|\s+$/g, "").split(/\s+/);

          if (vals.length === 3) {
            epoch = parseFloat(vals[0]);
            model = vals[1];
            modelDate = vals[2];
          } else if (vals.length === 6) {
            wmm.push({
              n: parseInt(vals[0], 10),
              m: parseInt(vals[1], 10),
              gnm: parseFloat(vals[2]),
              hnm: parseFloat(vals[3]),
              dgnm: parseFloat(vals[4]),
              dhnm: parseFloat(vals[5])
            });
          }
        }
      }

      return {
        epoch: epoch,
        model: model,
        modelDate: modelDate,
        wmm: wmm
      };
    }(cof);
  }

  function unnormalize(wmm) {
    var i,
        j,
        m,
        n,
        D2,
        flnmj,
        c = [z.slice(), z.slice(), z.slice(), z.slice(), z.slice(), z.slice(), z.slice(), z.slice(), z.slice(), z.slice(), z.slice(), z.slice(), z.slice()],
        cd = [z.slice(), z.slice(), z.slice(), z.slice(), z.slice(), z.slice(), z.slice(), z.slice(), z.slice(), z.slice(), z.slice(), z.slice(), z.slice()],
        k = [z.slice(), z.slice(), z.slice(), z.slice(), z.slice(), z.slice(), z.slice(), z.slice(), z.slice(), z.slice(), z.slice(), z.slice(), z.slice()],
        snorm = [z.slice(), z.slice(), z.slice(), z.slice(), z.slice(), z.slice(), z.slice(), z.slice(), z.slice(), z.slice(), z.slice(), z.slice(), z.slice()],
        model = wmm.wmm;

    for (i in model) {
      if (model.hasOwnProperty(i)) {
        if (model[i].m <= model[i].n) {
          c[model[i].m][model[i].n] = model[i].gnm;
          cd[model[i].m][model[i].n] = model[i].dgnm;

          if (model[i].m !== 0) {
            c[model[i].n][model[i].m - 1] = model[i].hnm;
            cd[model[i].n][model[i].m - 1] = model[i].dhnm;
          }
        }
      }
    }
    /* CONVERT SCHMIDT NORMALIZED GAUSS COEFFICIENTS TO UNNORMALIZED */


    snorm[0][0] = 1;

    for (n = 1; n <= maxord; n++) {
      snorm[0][n] = snorm[0][n - 1] * (2 * n - 1) / n;
      j = 2;

      for (m = 0, D2 = n - m + 1; D2 > 0; D2--, m++) {
        k[m][n] = ((n - 1) * (n - 1) - m * m) / ((2 * n - 1) * (2 * n - 3));

        if (m > 0) {
          flnmj = (n - m + 1) * j / (n + m);
          snorm[m][n] = snorm[m - 1][n] * Math.sqrt(flnmj);
          j = 1;
          c[n][m - 1] = snorm[m][n] * c[n][m - 1];
          cd[n][m - 1] = snorm[m][n] * cd[n][m - 1];
        }

        c[m][n] = snorm[m][n] * c[m][n];
        cd[m][n] = snorm[m][n] * cd[m][n];
      }
    }

    k[1][1] = 0.0;
    unnormalizedWMM = {
      epoch: wmm.epoch,
      k: k,
      c: c,
      cd: cd
    };
  }

  this.setCof = function (cof) {
    parseCof(cof);
    unnormalize(wmm);
  };

  this.getWmm = function () {
    return wmm;
  };

  this.setUnnorm = function (val) {
    unnormalizedWMM = val;
  };

  this.getUnnorm = function () {
    return unnormalizedWMM;
  };

  this.getEpoch = function () {
    return unnormalizedWMM.epoch;
  };

  this.setEllipsoid = function (e) {
    a = e.a;
    b = e.b;
    re = 6371.2;
    a2 = a * a;
    b2 = b * b;
    c2 = a2 - b2;
    a4 = a2 * a2;
    b4 = b2 * b2;
    c4 = a4 - b4;
  };

  this.getEllipsoid = function () {
    return {
      a: a,
      b: b
    };
  };

  this.calculate = function (glat, glon, h, date) {
    if (unnormalizedWMM === undefined) {
      throw new Error("A World Magnetic Model has not been set.");
    }

    if (glat === undefined || glon === undefined) {
      throw new Error("Latitude and longitude are required arguments.");
    }

    function rad2deg(rad) {
      return rad * (180 / Math.PI);
    }

    function deg2rad(deg) {
      return deg * (Math.PI / 180);
    }

    function decimalDate(date) {
      date = date || new Date();
      var year = date.getFullYear(),
          daysInYear = 365 + (year % 400 === 0 || year % 4 === 0 && year % 100 > 0 ? 1 : 0),
          msInYear = daysInYear * 24 * 60 * 60 * 1000;
      return date.getFullYear() + (date.valueOf() - new Date(year, 0).valueOf()) / msInYear;
    }

    var epoch = unnormalizedWMM.epoch,
        k = unnormalizedWMM.k,
        c = unnormalizedWMM.c,
        cd = unnormalizedWMM.cd,
        alt = h / 3280.8399 || 0,
        // convert h (in feet) to kilometers (default, 0 km)
    dt = decimalDate(date) - epoch,
        rlat = deg2rad(glat),
        rlon = deg2rad(glon),
        srlon = Math.sin(rlon),
        srlat = Math.sin(rlat),
        crlon = Math.cos(rlon),
        crlat = Math.cos(rlat),
        srlat2 = srlat * srlat,
        crlat2 = crlat * crlat,
        q,
        q1,
        q2,
        ct,
        st,
        r2,
        r,
        d,
        ca,
        sa,
        aor,
        ar,
        br = 0.0,
        bt = 0.0,
        bp = 0.0,
        bpp = 0.0,
        par,
        temp1,
        temp2,
        parp,
        D4,
        m,
        n,
        fn = [0, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13],
        fm = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
        z = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
        tc = [z.slice(), z.slice(), z.slice(), z.slice(), z.slice(), z.slice(), z.slice(), z.slice(), z.slice(), z.slice(), z.slice(), z.slice(), z.slice()],
        sp = z.slice(),
        cp = z.slice(),
        pp = z.slice(),
        p = [z.slice(), z.slice(), z.slice(), z.slice(), z.slice(), z.slice(), z.slice(), z.slice(), z.slice(), z.slice(), z.slice(), z.slice(), z.slice()],
        dp = [z.slice(), z.slice(), z.slice(), z.slice(), z.slice(), z.slice(), z.slice(), z.slice(), z.slice(), z.slice(), z.slice(), z.slice(), z.slice()],
        bx,
        by,
        bz,
        bh,
        ti,
        dec,
        dip,
        gv;
    sp[0] = 0.0;
    sp[1] = srlon;
    cp[1] = crlon;
    tc[0][0] = 0;
    cp[0] = 1.0;
    pp[0] = 1.0;
    p[0][0] = 1;
    /* CONVERT FROM GEODETIC COORDS. TO SPHERICAL COORDS. */

    q = Math.sqrt(a2 - c2 * srlat2);
    q1 = alt * q;
    q2 = (q1 + a2) / (q1 + b2) * ((q1 + a2) / (q1 + b2));
    ct = srlat / Math.sqrt(q2 * crlat2 + srlat2);
    st = Math.sqrt(1.0 - ct * ct);
    r2 = alt * alt + 2.0 * q1 + (a4 - c4 * srlat2) / (q * q);
    r = Math.sqrt(r2);
    d = Math.sqrt(a2 * crlat2 + b2 * srlat2);
    ca = (alt + d) / r;
    sa = c2 * crlat * srlat / (r * d);

    for (m = 2; m <= maxord; m++) {
      sp[m] = sp[1] * cp[m - 1] + cp[1] * sp[m - 1];
      cp[m] = cp[1] * cp[m - 1] - sp[1] * sp[m - 1];
    }

    aor = re / r;
    ar = aor * aor;

    for (n = 1; n <= maxord; n++) {
      ar = ar * aor;

      for (m = 0, D4 = n + m + 1; D4 > 0; D4--, m++) {
        /*
        		COMPUTE UNNORMALIZED ASSOCIATED LEGENDRE POLYNOMIALS
        		AND DERIVATIVES VIA RECURSION RELATIONS
        */
        if (n === m) {
          p[m][n] = st * p[m - 1][n - 1];
          dp[m][n] = st * dp[m - 1][n - 1] + ct * p[m - 1][n - 1];
        } else if (n === 1 && m === 0) {
          p[m][n] = ct * p[m][n - 1];
          dp[m][n] = ct * dp[m][n - 1] - st * p[m][n - 1];
        } else if (n > 1 && n !== m) {
          if (m > n - 2) {
            p[m][n - 2] = 0;
          }

          if (m > n - 2) {
            dp[m][n - 2] = 0.0;
          }

          p[m][n] = ct * p[m][n - 1] - k[m][n] * p[m][n - 2];
          dp[m][n] = ct * dp[m][n - 1] - st * p[m][n - 1] - k[m][n] * dp[m][n - 2];
        }
        /*
        		TIME ADJUST THE GAUSS COEFFICIENTS
        */


        tc[m][n] = c[m][n] + dt * cd[m][n];

        if (m !== 0) {
          tc[n][m - 1] = c[n][m - 1] + dt * cd[n][m - 1];
        }
        /*
        		ACCUMULATE TERMS OF THE SPHERICAL HARMONIC EXPANSIONS
        */


        par = ar * p[m][n];

        if (m === 0) {
          temp1 = tc[m][n] * cp[m];
          temp2 = tc[m][n] * sp[m];
        } else {
          temp1 = tc[m][n] * cp[m] + tc[n][m - 1] * sp[m];
          temp2 = tc[m][n] * sp[m] - tc[n][m - 1] * cp[m];
        }

        bt = bt - ar * temp1 * dp[m][n];
        bp += fm[m] * temp2 * par;
        br += fn[n] * temp1 * par;
        /*
        			SPECIAL CASE:  NORTH/SOUTH GEOGRAPHIC POLES
        */

        if (st === 0.0 && m === 1) {
          if (n === 1) {
            pp[n] = pp[n - 1];
          } else {
            pp[n] = ct * pp[n - 1] - k[m][n] * pp[n - 2];
          }

          parp = ar * pp[n];
          bpp += fm[m] * temp2 * parp;
        }
      }
    }

    bp = st === 0.0 ? bpp : bp / st;
    /*
    	ROTATE MAGNETIC VECTOR COMPONENTS FROM SPHERICAL TO
    	GEODETIC COORDINATES
    */

    bx = -bt * ca - br * sa;
    by = bp;
    bz = bt * sa - br * ca;
    /*
    	COMPUTE DECLINATION (DEC), INCLINATION (DIP) AND
    	TOTAL INTENSITY (TI)
    */

    bh = Math.sqrt(bx * bx + by * by);
    ti = Math.sqrt(bh * bh + bz * bz);
    dec = rad2deg(Math.atan2(by, bx));
    dip = rad2deg(Math.atan2(bz, bh));
    /*
    	COMPUTE MAGNETIC GRID VARIATION IF THE CURRENT
    	GEODETIC POSITION IS IN THE ARCTIC OR ANTARCTIC
    	(I.E. GLAT > +55 DEGREES OR GLAT < -55 DEGREES)
    	OTHERWISE, SET MAGNETIC GRID VARIATION TO -999.0
    */

    if (Math.abs(glat) >= 55.0) {
      if (glat > 0.0 && glon >= 0.0) {
        gv = dec - glon;
      } else if (glat > 0.0 && glon < 0.0) {
        gv = dec + Math.abs(glon);
      } else if (glat < 0.0 && glon >= 0.0) {
        gv = dec + glon;
      } else if (glat < 0.0 && glon < 0.0) {
        gv = dec - Math.abs(glon);
      }

      if (gv > 180.0) {
        gv -= 360.0;
      } else if (gv < -180.0) {
        gv += 360.0;
      }
    }

    return {
      dec: dec,
      dip: dip,
      ti: ti,
      bh: bh,
      bx: bx,
      by: by,
      bz: bz,
      lat: glat,
      lon: glon,
      gv: gv
    };
  };

  this.calc = this.calculate;
  this.mag = this.calculate;

  if (model !== undefined) {
    // initialize
    if (typeof model === 'string') {
      // WMM.COF file
      parseCof(model);
      unnormalize(wmm);
    } else if (_typeof(model) === 'object') {
      // unnorm obj
      this.setUnnorm(model);
    } else {
      throw new Error("Invalid argument type");
    }
  }
}

var cof = "\n    2010.0            WMM-2010        11/20/2009\n  1  0  -29496.6       0.0       11.6        0.0\n  1  1   -1586.3    4944.4       16.5      -25.9\n  2  0   -2396.6       0.0      -12.1        0.0\n  2  1    3026.1   -2707.7       -4.4      -22.5\n  2  2    1668.6    -576.1        1.9      -11.8\n  3  0    1340.1       0.0        0.4        0.0\n  3  1   -2326.2    -160.2       -4.1        7.3\n  3  2    1231.9     251.9       -2.9       -3.9\n  3  3     634.0    -536.6       -7.7       -2.6\n  4  0     912.6       0.0       -1.8        0.0\n  4  1     808.9     286.4        2.3        1.1\n  4  2     166.7    -211.2       -8.7        2.7\n  4  3    -357.1     164.3        4.6        3.9\n  4  4      89.4    -309.1       -2.1       -0.8\n  5  0    -230.9       0.0       -1.0        0.0\n  5  1     357.2      44.6        0.6        0.4\n  5  2     200.3     188.9       -1.8        1.8\n  5  3    -141.1    -118.2       -1.0        1.2\n  5  4    -163.0       0.0        0.9        4.0\n  5  5      -7.8     100.9        1.0       -0.6\n  6  0      72.8       0.0       -0.2        0.0\n  6  1      68.6     -20.8       -0.2       -0.2\n  6  2      76.0      44.1       -0.1       -2.1\n  6  3    -141.4      61.5        2.0       -0.4\n  6  4     -22.8     -66.3       -1.7       -0.6\n  6  5      13.2       3.1       -0.3        0.5\n  6  6     -77.9      55.0        1.7        0.9\n  7  0      80.5       0.0        0.1        0.0\n  7  1     -75.1     -57.9       -0.1        0.7\n  7  2      -4.7     -21.1       -0.6        0.3\n  7  3      45.3       6.5        1.3       -0.1\n  7  4      13.9      24.9        0.4       -0.1\n  7  5      10.4       7.0        0.3       -0.8\n  7  6       1.7     -27.7       -0.7       -0.3\n  7  7       4.9      -3.3        0.6        0.3\n  8  0      24.4       0.0       -0.1        0.0\n  8  1       8.1      11.0        0.1       -0.1\n  8  2     -14.5     -20.0       -0.6        0.2\n  8  3      -5.6      11.9        0.2        0.4\n  8  4     -19.3     -17.4       -0.2        0.4\n  8  5      11.5      16.7        0.3        0.1\n  8  6      10.9       7.0        0.3       -0.1\n  8  7     -14.1     -10.8       -0.6        0.4\n  8  8      -3.7       1.7        0.2        0.3\n  9  0       5.4       0.0       -0.0        0.0\n  9  1       9.4     -20.5       -0.1       -0.0\n  9  2       3.4      11.5        0.0       -0.2\n  9  3      -5.2      12.8        0.3        0.0\n  9  4       3.1      -7.2       -0.4       -0.1\n  9  5     -12.4      -7.4       -0.3        0.1\n  9  6      -0.7       8.0        0.1       -0.0\n  9  7       8.4       2.1       -0.1       -0.2\n  9  8      -8.5      -6.1       -0.4        0.3\n  9  9     -10.1       7.0       -0.2        0.2\n 10  0      -2.0       0.0        0.0        0.0\n 10  1      -6.3       2.8       -0.0        0.1\n 10  2       0.9      -0.1       -0.1       -0.1\n 10  3      -1.1       4.7        0.2        0.0\n 10  4      -0.2       4.4       -0.0       -0.1\n 10  5       2.5      -7.2       -0.1       -0.1\n 10  6      -0.3      -1.0       -0.2       -0.0\n 10  7       2.2      -3.9        0.0       -0.1\n 10  8       3.1      -2.0       -0.1       -0.2\n 10  9      -1.0      -2.0       -0.2        0.0\n 10 10      -2.8      -8.3       -0.2       -0.1\n 11  0       3.0       0.0        0.0        0.0\n 11  1      -1.5       0.2        0.0       -0.0\n 11  2      -2.1       1.7       -0.0        0.1\n 11  3       1.7      -0.6        0.1        0.0\n 11  4      -0.5      -1.8       -0.0        0.1\n 11  5       0.5       0.9        0.0        0.0\n 11  6      -0.8      -0.4       -0.0        0.1\n 11  7       0.4      -2.5       -0.0        0.0\n 11  8       1.8      -1.3       -0.0       -0.1\n 11  9       0.1      -2.1        0.0       -0.1\n 11 10       0.7      -1.9       -0.1       -0.0\n 11 11       3.8      -1.8       -0.0       -0.1\n 12  0      -2.2       0.0       -0.0        0.0\n 12  1      -0.2      -0.9        0.0       -0.0\n 12  2       0.3       0.3        0.1        0.0\n 12  3       1.0       2.1        0.1       -0.0\n 12  4      -0.6      -2.5       -0.1        0.0\n 12  5       0.9       0.5       -0.0       -0.0\n 12  6      -0.1       0.6        0.0        0.1\n 12  7       0.5      -0.0        0.0        0.0\n 12  8      -0.4       0.1       -0.0        0.0\n 12  9      -0.4       0.3        0.0       -0.0\n 12 10       0.2      -0.9        0.0       -0.0\n 12 11      -0.8      -0.2       -0.1        0.0\n 12 12       0.0       0.9        0.1        0.0\n999999999999999999999999999999999999999999999999\n999999999999999999999999999999999999999999999999\n";
var geoMag = new Geomag(cof).mag; // var geoMag = newGeomag.mag;

var _self = self || window,
    serverBase = (_self.serverBase || 'maps.kosmosnimki.ru').replace(/http.*:\/\//, '').replace(/\//g, '');

var str = self.location.origin || '',
    _protocol = str.substring(0, str.indexOf('/')),
    syncParams = {},
    fetchOptions = {
  // method: 'post',
  // headers: {'Content-type': 'application/x-www-form-urlencoded'},
  mode: 'cors',
  redirect: 'follow',
  credentials: 'include'
};

var parseURLParams = function parseURLParams(str) {
  var sp = new URLSearchParams(str || location.search),
      out = {},
      arr = [];
  var _iteratorNormalCompletion = true;
  var _didIteratorError = false;
  var _iteratorError = undefined;

  try {
    for (var _iterator = sp[Symbol.iterator](), _step; !(_iteratorNormalCompletion = (_step = _iterator.next()).done); _iteratorNormalCompletion = true) {
      var p = _step.value;
      var k = p[0],
          z = p[1];

      if (z) {
        if (!out[k]) {
          out[k] = [];
        }

        out[k].push(z);
      } else {
        arr.push(k);
      }
    }
  } catch (err) {
    _didIteratorError = true;
    _iteratorError = err;
  } finally {
    try {
      if (!_iteratorNormalCompletion && _iterator["return"] != null) {
        _iterator["return"]();
      }
    } finally {
      if (_didIteratorError) {
        throw _iteratorError;
      }
    }
  }

  return {
    main: arr,
    keys: out
  };
};

var utils = {
  extend: function extend(dest) {
    var i, j, len, src;

    for (j = 1, len = arguments.length; j < len; j++) {
      src = arguments[j];

      for (i in src) {
        dest[i] = src[i];
      }
    }

    return dest;
  },
  makeTileKeys: function makeTileKeys(it, ptiles) {
    var tklen = it.tilesOrder.length,
        arr = it.tiles,
        tiles = {},
        newTiles = {};

    while (arr.length) {
      var t = arr.splice(0, tklen),
          tk = t.join('_'),
          tile = ptiles[tk];

      if (!tile || !tile.data) {
        if (!tile) {
          tiles[tk] = {
            tp: {
              z: t[0],
              x: t[1],
              y: t[2],
              v: t[3],
              s: t[4],
              d: t[5]
            }
          };
        } else {
          tiles[tk] = tile;
        }

        newTiles[tk] = true;
      } else {
        tiles[tk] = tile;
      }
    }

    return {
      tiles: tiles,
      newTiles: newTiles
    };
  },
  getDataSource: function getDataSource(id, hostName) {
    // var maps = gmx._maps[hostName];
    // for (var mID in maps) {
    // var ds = maps[mID].dataSources[id];
    // if (ds) { return ds; }
    // }
    return null;
  },
  getZoomRange: function getZoomRange(info) {
    var arr = info.properties.styles,
        out = [40, 0];

    for (var i = 0, len = arr.length; i < len; i++) {
      var st = arr[i];
      out[0] = Math.min(out[0], st.MinZoom);
      out[1] = Math.max(out[1], st.MaxZoom);
    }

    out[0] = out[0] === 40 ? 1 : out[0];
    out[1] = out[1] === 0 ? 22 : out[1];
    return out;
  },
  chkProtocol: function chkProtocol(url) {
    return url.substr(0, _protocol.length) === _protocol ? url : _protocol + url;
  },
  getFormBody: function getFormBody(par) {
    return Object.keys(par).map(function (key) {
      return encodeURIComponent(key) + '=' + encodeURIComponent(par[key]);
    }).join('&');
  },
  chkResponse: function chkResponse(resp, type) {
    if (resp.status < 200 || resp.status >= 300) {
      // error
      return Promise.reject(resp);
    } else {
      var contentType = resp.headers.get('Content-Type');

      if (type === 'bitmap') {
        // get blob
        return resp.blob();
      } else if (contentType.indexOf('application/json') > -1) {
        // application/json; charset=utf-8
        return resp.json();
      } else if (contentType.indexOf('text/javascript') > -1) {
        // text/javascript; charset=utf-8
        return resp.text(); // } else if (contentType.indexOf('application/json') > -1) {	 		// application/json; charset=utf-8
        // ret = resp.text();
        // } else if (contentType.indexOf('application/json') > -1) {	 		// application/json; charset=utf-8
        // ret = resp.formData();
        // } else if (contentType.indexOf('application/json') > -1) {	 		// application/json; charset=utf-8
        // ret = resp.arrayBuffer();
        // } else {
      }
    }

    return resp.text();
  },
  // getJson: function(url, params, options) {
  getJson: function getJson(queue) {
    // log('getJson', _protocol, queue, Date.now())
    var par = utils.extend({}, queue.params, syncParams),
        options = queue.options || {},
        opt = utils.extend({
      method: 'post',
      headers: {
        'Content-type': 'application/x-www-form-urlencoded'
      } // mode: 'cors',
      // redirect: 'follow',
      // credentials: 'include'

    }, fetchOptions, options, {
      body: utils.getFormBody(par)
    });
    return fetch(utils.chkProtocol(queue.url), opt).then(function (res) {
      return utils.chkResponse(res, options.type);
    }).then(function (res) {
      var out = {
        url: queue.url,
        queue: queue,
        load: true,
        res: res
      }; // if (queue.send) {
      // handler.workerContext.postMessage(out);
      // } else {

      return out; // }
    })["catch"](function (err) {
      return {
        url: queue.url,
        queue: queue,
        load: false,
        error: err.toString()
      }; // handler.workerContext.postMessage(out);
    });
  },
  parseLayerProps: function parseLayerProps(prop) {
    var ph = utils.getTileAttributes(prop);
    return utils.extend({
      properties: prop
    }, utils.getTileAttributes(prop), utils.parseMetaProps(prop));
  },
  parseMetaProps: function parseMetaProps(prop) {
    var meta = prop.MetaProperties || {},
        ph = {};
    ph.dataSource = prop.dataSource || prop.LayerID;

    if ('parentLayer' in meta) {
      // изменить dataSource через MetaProperties
      ph.dataSource = meta.parentLayer.Value || '';
    }

    ['srs', // проекция слоя
    'gmxProxy', // установка прокачивалки
    'filter', // фильтр слоя
    'isGeneralized', // флаг generalization
    'isFlatten', // флаг flatten
    'multiFilters', // проверка всех фильтров для обьектов слоя
    'showScreenTiles', // показывать границы экранных тайлов
    'dateBegin', // фильтр по дате начало периода
    'dateEnd', // фильтр по дате окончание периода
    'shiftX', // сдвиг всего слоя
    'shiftY', // сдвиг всего слоя
    'shiftXfield', // сдвиг растров объектов слоя
    'shiftYfield', // сдвиг растров объектов слоя
    'quicklookPlatform', // тип спутника
    'quicklookX1', // точки привязки снимка
    'quicklookY1', // точки привязки снимка
    'quicklookX2', // точки привязки снимка
    'quicklookY2', // точки привязки снимка
    'quicklookX3', // точки привязки снимка
    'quicklookY3', // точки привязки снимка
    'quicklookX4', // точки привязки снимка
    'quicklookY4' // точки привязки снимка
    ].forEach(function (k) {
      ph[k] = k in meta ? meta[k].Value : '';
    });

    if (ph.gmxProxy.toLowerCase() === 'true') {
      // проверка прокачивалки
      ph.gmxProxy = L.gmx.gmxProxy;
    }

    if ('parentLayer' in meta) {
      // фильтр слоя		// todo удалить после изменений вов вьювере
      ph.dataSource = meta.parentLayer.Value || prop.dataSource || '';
    }

    return ph;
  },
  getTileAttributes: function getTileAttributes(prop) {
    var tileAttributeIndexes = {},
        tileAttributeTypes = {};

    if (prop.attributes) {
      var attrs = prop.attributes,
          attrTypes = prop.attrTypes || null;

      if (prop.identityField) {
        tileAttributeIndexes[prop.identityField] = 0;
      }

      for (var a = 0; a < attrs.length; a++) {
        var key = attrs[a];
        tileAttributeIndexes[key] = a + 1;
        tileAttributeTypes[key] = attrTypes ? attrTypes[a] : 'string';
      }
    }

    return {
      tileAttributeTypes: tileAttributeTypes,
      tileAttributeIndexes: tileAttributeIndexes
    };
  }
};
/*
const requestSessionKey = (serverHost, apiKey) => {
	let keys = _sessionKeys;
	if (!(serverHost in keys)) {
		keys[serverHost] = new Promise(function(resolve, reject) {
			if (apiKey) {
				utils.getJson({
					url: '//' + serverHost + '/ApiKey.ashx',
					params: {WrapStyle: 'None', Key: apiKey}
				})
					.then(function(json) {
						let res = json.res;
						if (res.Status === 'ok' && res.Result) {
							resolve(res.Result.Key !== 'null' ? '' : res.Result.Key);
						} else {
							reject(json);
						}
					})
					.catch(function() {
						resolve('');
					});
			} else {
				resolve('');
			}
		});
	}
	return keys[serverHost];
};
*/

var _maps = {};

var getMapTree = function getMapTree(pars) {
  pars = pars || {};
  var hostName = pars.hostName || serverBase,
      id = pars.mapId;
  return utils.getJson({
    url: '//' + hostName + '/Map/GetMapFolder',
    // options: {},
    params: {
      srs: 3857,
      skipTiles: 'All',
      mapId: id,
      folderId: 'root',
      visibleItemOnly: false
    }
  }).then(function (json) {
    var out = parseTree(json.res);
    _maps[hostName] = _maps[hostName] || {};
    _maps[hostName][id] = out;
    return parseTree(out);
  });
};

var _iterateNodeChilds = function _iterateNodeChilds(node, level, out) {
  level = level || 0;
  out = out || {
    layers: []
  };

  if (node) {
    var type = node.type,
        content = node.content,
        props = content.properties;

    if (type === 'layer') {
      var ph = utils.parseLayerProps(props);
      ph.level = level;

      if (content.geometry) {
        ph.geometry = content.geometry;
      }

      out.layers.push(ph);
    } else if (type === 'group') {
      var childs = content.children || [];
      out.layers.push({
        level: level,
        group: true,
        childsLen: childs.length,
        properties: props
      });
      childs.map(function (it) {
        _iterateNodeChilds(it, level + 1, out);
      });
    }
  } else {
    return out;
  }

  return out;
};

var parseTree = function parseTree(json) {
  var out = {};

  if (json.Status === 'error') {
    out = json;
  } else if (json.Result && json.Result.content) {
    out = _iterateNodeChilds(json.Result);
    out.mapAttr = out.layers.shift();
  } // console.log('______json_out_______', out, json)


  return out;
};

var addDataSource = function addDataSource(pars) {
  pars = pars || {};
  var id = pars.id;

  if (id) {
    var hostName = pars.hostName;
  } else {
    console.warn('Warning: Specify layer \'id\' and \'hostName\`', pars);
  }

  return;
};

var removeDataSource = function removeDataSource(pars) {
  pars = pars || {};
  var id = pars.id;

  if (id) {
    var hostName = pars.hostName;
  } else {
    console.warn('Warning: Specify layer \'id\' and \'hostName\`', pars);
  } //Requests.removeDataSource({id: message.layerID, hostName: message.hostName}).then((json) => {


  return;
};

var getColumnStat = function getColumnStat(pars) {
  pars = pars || {};
  var hostName = pars.hostName || serverBase;
  return utils.getJson({
    url: '//' + hostName + '/VectorLayer/GetColumnStat',
    params: {
      layerID: pars.id,
      column: pars.column,
      maxUnique: 10000,
      unique: true
    }
  });
};

var chkTask = function chkTask(id) {
  var UPDATE_INTERVAL = 2000;
  var hostName = serverBase;
  return new Promise(function (resolve, reject) {
    var interval = setInterval(function () {
      fetch('//' + hostName + '/AsyncTask.ashx?WrapStyle=None&TaskID=' + id, {
        mode: 'cors',
        credentials: 'include'
      }).then(function (res) {
        return res.json();
      }).then(function (json) {
        var _json$Result = json.Result,
            Completed = _json$Result.Completed,
            ErrorInfo = _json$Result.ErrorInfo;

        if (ErrorInfo) {
          clearInterval(interval);
          reject(json);
        } else if (Completed) {
          clearInterval(interval);
          resolve(json);
        }
      });
    }, UPDATE_INTERVAL);
  });
};

var createFilterLayer = function createFilterLayer(pars, opt) {
  pars = pars || {};
  var hostName = pars.hostName || serverBase,
      styles = pars.styles;
  return new Promise(function (resolve) {
    utils.getJson({
      url: '//' + hostName + '/VectorLayer/Insert.ashx',
      // options: {},
      params: pars
    }).then(function (json) {
      if (json.res.Status === 'ok') {
        chkTask(json.res.Result.TaskID).then(function (json) {
          if (json.Status === 'ok') {
            var contentNode = {
              type: 'layer',
              content: json.Result.Result
            };
            delete contentNode.content.geometry;
            var LayerID = contentNode.content.properties.LayerID;

            window._layersTree.copyHandler(contentNode, $(window._queryMapLayers.buildedTree.firstChild).children("div[MapID]")[0], false, true, function () {
              var LayerID = contentNode.content.properties.LayerID;
              var div = $(window._queryMapLayers.buildedTree).find("div[LayerID='" + LayerID + "']")[0];
              div.gmxProperties.content.properties.styles = styles;

              window._mapHelper.updateMapStyles(styles, LayerID);

              resolve(contentNode);
            });
          }
        })["catch"](function (err) {
          console.log(err);
          resolve({
            error: 'Ошибка',
            Result: json.Result,
            pars: pars
          });
        });
      }
    })["catch"](function (err) {
      return console.log(err);
    });
  });
};

var downloadLayer = function downloadLayer(node, id) {
  node.setAttribute('href', new URL('/DownloadVector?format=csv&layer=' + id, location.protocol + '//' + serverBase));
  return;
  /*
  		var par = utils.extend({}, queue.params, syncParams),
  			options = queue.options || {},
  			opt = utils.extend({
  				method: 'post',
  				headers: {'Content-type': 'application/x-www-form-urlencoded'}
  				// mode: 'cors',
  				// redirect: 'follow',
  				// credentials: 'include'
  			}, fetchOptions, options, {
  				body: utils.getFormBody(par)
  			});
  	return new Promise((resolve) => {
  		utils.getJson({
  			// url: '//' + hostName + '/DownloadLayer.ashx',
  			url: '//' + serverBase + '/DownloadVector',
  			// options: {},
  			params: {
  				format: 'csv',
  				layer: id
  			}
  		})
  		.then((json) => {
  			// console.log('DownloadVector', json);
  			// let blob = new Blob([JSON.stringify(features, null, '\t')], {type: 'text/json;charset=utf-8;'});
  				//blob = new Blob([JSON.stringify(features, null, '\t')], {type: type});
  			node.setAttribute('href', window.URL.createObjectURL(json.res));
  			
  			// if (json.res.Status === 'ok') {
  				// chkTask(json.res.Result.TaskID)
  				// .then(json => {
  					// if (json.Status === 'ok') {
  						// let contentNode = { type: 'layer', content: json.Result.Result };
  						// delete contentNode.content.geometry;
  						// let LayerID = contentNode.content.properties.LayerID;
  						// window._layersTree.copyHandler(contentNode, $( window._queryMapLayers.buildedTree.firstChild).children("div[MapID]")[0], false, true, () => {
  							// resolve(contentNode);
  						// });
  					// }
  				// })
  				// .catch(err => console.log(err));
  			// }
  		})
  		.catch(err => console.log(err));
  	});
  	*/
};

var Requests = {
  downloadLayer: downloadLayer,
  getColumnStat: getColumnStat,
  createFilterLayer: createFilterLayer,
  addDataSource: addDataSource,
  removeDataSource: removeDataSource,
  parseURLParams: parseURLParams,
  getMapTree: getMapTree // getReportsCount,
  // getLayerItems

};

/* src\Filters\Filters.svelte generated by Svelte v3.16.4 */

function get_each_context_1(ctx, list, i) {
	const child_ctx = ctx.slice();
	child_ctx[30] = list[i];
	return child_ctx;
}

function get_each_context(ctx, list, i) {
	const child_ctx = ctx.slice();
	child_ctx[27] = list[i];
	return child_ctx;
}

function get_each_context_2(ctx, list, i) {
	const child_ctx = ctx.slice();
	child_ctx[33] = list[i];
	return child_ctx;
}

// (256:4) {#each Object.keys(filterLayers) as k}
function create_each_block_2(ctx) {
	let option;
	let t_value = /*filterLayers*/ ctx[3][/*k*/ ctx[33]].title + "";
	let t;
	let option_value_value;

	return {
		c() {
			option = element("option");
			t = text(t_value);
			option.__value = option_value_value = /*filterLayers*/ ctx[3][/*k*/ ctx[33]].id;
			option.value = option.__value;
		},
		m(target, anchor) {
			insert(target, option, anchor);
			append(option, t);
		},
		p(ctx, dirty) {
			if (dirty[0] & /*filterLayers*/ 8 && t_value !== (t_value = /*filterLayers*/ ctx[3][/*k*/ ctx[33]].title + "")) set_data(t, t_value);

			if (dirty[0] & /*filterLayers*/ 8 && option_value_value !== (option_value_value = /*filterLayers*/ ctx[3][/*k*/ ctx[33]].id)) {
				option.__value = option_value_value;
			}

			option.value = option.__value;
		},
		d(detaching) {
			if (detaching) detach(option);
		}
	};
}

// (263:1) {#if currLayer}
function create_if_block_1(ctx) {
	let t0;
	let div1;
	let div0;
	let input;
	let label;
	let t2;
	let dispose;
	let if_block0 = !/*drawingChecked*/ ctx[8] && create_if_block_3(ctx);
	let if_block1 = /*currDrawingObj*/ ctx[6] && create_if_block_2(ctx);

	return {
		c() {
			if (if_block0) if_block0.c();
			t0 = space();
			div1 = element("div");
			div0 = element("div");
			input = element("input");
			label = element("label");
			label.textContent = "Поиск федеральных объектов недвижимости по пересечению с контуром (создайте контур на Геопортале)";
			t2 = space();
			if (if_block1) if_block1.c();
			attr(input, "type", "checkbox");
			attr(input, "name", "checkboxG4");
			attr(input, "id", "checkboxG4");
			attr(input, "class", "css-checkbox2");
			attr(input, "title", "Нарисовать или выбрать объект по правой кнопке на вершине");
			attr(label, "for", "checkboxG4");
			attr(label, "class", "css-label2 radGroup1");
			attr(div0, "class", "checkbox");
			attr(div1, "class", "row");
			dispose = listen(input, "change", /*createDrawing*/ ctx[12]);
		},
		m(target, anchor) {
			if (if_block0) if_block0.m(target, anchor);
			insert(target, t0, anchor);
			insert(target, div1, anchor);
			append(div1, div0);
			append(div0, input);
			/*input_binding*/ ctx[24](input);
			append(div0, label);
			append(div0, t2);
			if (if_block1) if_block1.m(div0, null);
		},
		p(ctx, dirty) {
			if (!/*drawingChecked*/ ctx[8]) {
				if (if_block0) {
					if_block0.p(ctx, dirty);
				} else {
					if_block0 = create_if_block_3(ctx);
					if_block0.c();
					if_block0.m(t0.parentNode, t0);
				}
			} else if (if_block0) {
				if_block0.d(1);
				if_block0 = null;
			}

			if (/*currDrawingObj*/ ctx[6]) {
				if (if_block1) {
					if_block1.p(ctx, dirty);
				} else {
					if_block1 = create_if_block_2(ctx);
					if_block1.c();
					if_block1.m(div0, null);
				}
			} else if (if_block1) {
				if_block1.d(1);
				if_block1 = null;
			}
		},
		d(detaching) {
			if (if_block0) if_block0.d(detaching);
			if (detaching) detach(t0);
			if (detaching) detach(div1);
			/*input_binding*/ ctx[24](null);
			if (if_block1) if_block1.d();
			dispose();
		}
	};
}

// (264:2) {#if !drawingChecked}
function create_if_block_3(ctx) {
	let each_1_anchor;
	let each_value = Object.keys(/*currLayer*/ ctx[4].filters);
	let each_blocks = [];

	for (let i = 0; i < each_value.length; i += 1) {
		each_blocks[i] = create_each_block(get_each_context(ctx, each_value, i));
	}

	return {
		c() {
			for (let i = 0; i < each_blocks.length; i += 1) {
				each_blocks[i].c();
			}

			each_1_anchor = empty();
		},
		m(target, anchor) {
			for (let i = 0; i < each_blocks.length; i += 1) {
				each_blocks[i].m(target, anchor);
			}

			insert(target, each_1_anchor, anchor);
		},
		p(ctx, dirty) {
			if (dirty[0] & /*currLayer, clearData*/ 16400) {
				each_value = Object.keys(/*currLayer*/ ctx[4].filters);
				let i;

				for (i = 0; i < each_value.length; i += 1) {
					const child_ctx = get_each_context(ctx, each_value, i);

					if (each_blocks[i]) {
						each_blocks[i].p(child_ctx, dirty);
					} else {
						each_blocks[i] = create_each_block(child_ctx);
						each_blocks[i].c();
						each_blocks[i].m(each_1_anchor.parentNode, each_1_anchor);
					}
				}

				for (; i < each_blocks.length; i += 1) {
					each_blocks[i].d(1);
				}

				each_blocks.length = each_value.length;
			}
		},
		d(detaching) {
			destroy_each(each_blocks, detaching);
			if (detaching) detach(each_1_anchor);
		}
	};
}

// (270:4) {#if currLayer.filters[field].datalist}
function create_if_block_4(ctx) {
	let datalist;
	let datalist_id_value;
	let each_value_1 = /*currLayer*/ ctx[4].filters[/*field*/ ctx[27]].datalist;
	let each_blocks = [];

	for (let i = 0; i < each_value_1.length; i += 1) {
		each_blocks[i] = create_each_block_1(get_each_context_1(ctx, each_value_1, i));
	}

	return {
		c() {
			datalist = element("datalist");

			for (let i = 0; i < each_blocks.length; i += 1) {
				each_blocks[i].c();
			}

			attr(datalist, "id", datalist_id_value = /*field*/ ctx[27]);
		},
		m(target, anchor) {
			insert(target, datalist, anchor);

			for (let i = 0; i < each_blocks.length; i += 1) {
				each_blocks[i].m(datalist, null);
			}
		},
		p(ctx, dirty) {
			if (dirty[0] & /*currLayer*/ 16) {
				each_value_1 = /*currLayer*/ ctx[4].filters[/*field*/ ctx[27]].datalist;
				let i;

				for (i = 0; i < each_value_1.length; i += 1) {
					const child_ctx = get_each_context_1(ctx, each_value_1, i);

					if (each_blocks[i]) {
						each_blocks[i].p(child_ctx, dirty);
					} else {
						each_blocks[i] = create_each_block_1(child_ctx);
						each_blocks[i].c();
						each_blocks[i].m(datalist, null);
					}
				}

				for (; i < each_blocks.length; i += 1) {
					each_blocks[i].d(1);
				}

				each_blocks.length = each_value_1.length;
			}

			if (dirty[0] & /*currLayer*/ 16 && datalist_id_value !== (datalist_id_value = /*field*/ ctx[27])) {
				attr(datalist, "id", datalist_id_value);
			}
		},
		d(detaching) {
			if (detaching) detach(datalist);
			destroy_each(each_blocks, detaching);
		}
	};
}

// (272:6) {#each currLayer.filters[field].datalist as pt}
function create_each_block_1(ctx) {
	let option;
	let option_value_value;

	return {
		c() {
			option = element("option");
			option.__value = option_value_value = /*pt*/ ctx[30].value;
			option.value = option.__value;
		},
		m(target, anchor) {
			insert(target, option, anchor);
		},
		p(ctx, dirty) {
			if (dirty[0] & /*currLayer*/ 16 && option_value_value !== (option_value_value = /*pt*/ ctx[30].value)) {
				option.__value = option_value_value;
			}

			option.value = option.__value;
		},
		d(detaching) {
			if (detaching) detach(option);
		}
	};
}

// (265:3) {#each Object.keys(currLayer.filters) as field}
function create_each_block(ctx) {
	let div2;
	let div0;
	let t0_value = /*currLayer*/ ctx[4].filters[/*field*/ ctx[27]].title + "";
	let t0;
	let t1;
	let div1;
	let input;
	let input_name_value;
	let input_list_value;
	let t2;
	let t3;
	let dispose;
	let if_block = /*currLayer*/ ctx[4].filters[/*field*/ ctx[27]].datalist && create_if_block_4(ctx);

	return {
		c() {
			div2 = element("div");
			div0 = element("div");
			t0 = text(t0_value);
			t1 = space();
			div1 = element("div");
			input = element("input");
			t2 = space();
			if (if_block) if_block.c();
			t3 = space();
			attr(div0, "class", "title");
			attr(input, "type", "text");
			attr(input, "name", input_name_value = /*field*/ ctx[27]);
			attr(input, "list", input_list_value = /*field*/ ctx[27]);
			attr(div1, "class", "input");
			attr(div2, "class", "row");
			dispose = listen(input, "change", /*clearData*/ ctx[14]);
		},
		m(target, anchor) {
			insert(target, div2, anchor);
			append(div2, div0);
			append(div0, t0);
			append(div2, t1);
			append(div2, div1);
			append(div1, input);
			append(div1, t2);
			if (if_block) if_block.m(div1, null);
			append(div2, t3);
		},
		p(ctx, dirty) {
			if (dirty[0] & /*currLayer*/ 16 && t0_value !== (t0_value = /*currLayer*/ ctx[4].filters[/*field*/ ctx[27]].title + "")) set_data(t0, t0_value);

			if (dirty[0] & /*currLayer*/ 16 && input_name_value !== (input_name_value = /*field*/ ctx[27])) {
				attr(input, "name", input_name_value);
			}

			if (dirty[0] & /*currLayer*/ 16 && input_list_value !== (input_list_value = /*field*/ ctx[27])) {
				attr(input, "list", input_list_value);
			}

			if (/*currLayer*/ ctx[4].filters[/*field*/ ctx[27]].datalist) {
				if (if_block) {
					if_block.p(ctx, dirty);
				} else {
					if_block = create_if_block_4(ctx);
					if_block.c();
					if_block.m(div1, null);
				}
			} else if (if_block) {
				if_block.d(1);
				if_block = null;
			}
		},
		d(detaching) {
			if (detaching) detach(div2);
			if (if_block) if_block.d();
			dispose();
		}
	};
}

// (284:4) {#if currDrawingObj}
function create_if_block_2(ctx) {
	let span;
	let t;

	return {
		c() {
			span = element("span");
			t = text(/*currDrawingObjArea*/ ctx[7]);
			attr(span, "class", "currDrawingObjArea");
		},
		m(target, anchor) {
			insert(target, span, anchor);
			append(span, t);
		},
		p(ctx, dirty) {
			if (dirty[0] & /*currDrawingObjArea*/ 128) set_data(t, /*currDrawingObjArea*/ ctx[7]);
		},
		d(detaching) {
			if (detaching) detach(span);
		}
	};
}

// (299:0) {#if error}
function create_if_block(ctx) {
	let div;
	let span;
	let t;

	return {
		c() {
			div = element("div");
			span = element("span");
			t = text(/*error*/ ctx[0]);
			attr(span, "class", "txt");
			attr(div, "class", "row error");
		},
		m(target, anchor) {
			insert(target, div, anchor);
			append(div, span);
			append(span, t);
		},
		p(ctx, dirty) {
			if (dirty[0] & /*error*/ 1) set_data(t, /*error*/ ctx[0]);
		},
		d(detaching) {
			if (detaching) detach(div);
		}
	};
}

function create_fragment(ctx) {
	let div4;
	let div2;
	let div0;
	let t1;
	let div1;
	let select;
	let option;
	let t2;
	let t3;
	let div3;
	let button0;
	let t5;
	let a;
	let iframe_1;
	let t6;
	let button1;
	let a_class_value;
	let div3_class_value;
	let t8;
	let dispose;
	let each_value_2 = Object.keys(/*filterLayers*/ ctx[3]);
	let each_blocks = [];

	for (let i = 0; i < each_value_2.length; i += 1) {
		each_blocks[i] = create_each_block_2(get_each_context_2(ctx, each_value_2, i));
	}

	let if_block0 = /*currLayer*/ ctx[4] && create_if_block_1(ctx);
	let if_block1 = /*error*/ ctx[0] && create_if_block(ctx);

	return {
		c() {
			div4 = element("div");
			div2 = element("div");
			div0 = element("div");
			div0.textContent = "Выбор слоя";
			t1 = space();
			div1 = element("div");
			select = element("select");
			option = element("option");

			for (let i = 0; i < each_blocks.length; i += 1) {
				each_blocks[i].c();
			}

			t2 = space();
			if (if_block0) if_block0.c();
			t3 = space();
			div3 = element("div");
			button0 = element("button");
			button0.textContent = "Создать слой по фильтру";
			t5 = space();
			a = element("a");
			iframe_1 = element("iframe");
			t6 = space();
			button1 = element("button");
			button1.textContent = "Экспорт в Excel";
			t8 = space();
			if (if_block1) if_block1.c();
			attr(div0, "class", "title");
			option.__value = "";
			option.value = option.__value;
			attr(div1, "class", "input");
			attr(div2, "class", "row hidden");
			attr(button0, "class", "button");
			attr(iframe_1, "name", "download");
			attr(iframe_1, "title", "");
			attr(iframe_1, "class", "hidden");
			attr(button1, "class", "button");
			attr(a, "href", "load");
			attr(a, "download", "features.geojson");
			attr(a, "target", "download");
			attr(a, "onload", /*setHidden*/ ctx[13]);
			attr(a, "class", a_class_value = "exportHref " + (/*filteredLayerID*/ ctx[9] ? "" : "hidden"));
			attr(div3, "class", div3_class_value = "bottom " + (/*currLayer*/ ctx[4] ? "" : "hidden"));
			attr(div4, "class", "sidebar-opened");

			dispose = [
				listen(window, "focus", /*setHidden*/ ctx[13]),
				listen(select, "change", /*changeLayer*/ ctx[11]),
				listen(button0, "click", /*createFilterLayer*/ ctx[16]),
				listen(iframe_1, "focus", /*clearData*/ ctx[14]),
				listen(button1, "click", /*createExport*/ ctx[15])
			];
		},
		m(target, anchor) {
			insert(target, div4, anchor);
			append(div4, div2);
			append(div2, div0);
			append(div2, t1);
			append(div2, div1);
			append(div1, select);
			append(select, option);

			for (let i = 0; i < each_blocks.length; i += 1) {
				each_blocks[i].m(select, null);
			}

			/*div2_binding*/ ctx[23](div2);
			append(div4, t2);
			if (if_block0) if_block0.m(div4, null);
			append(div4, t3);
			append(div4, div3);
			append(div3, button0);
			append(div3, t5);
			append(div3, a);
			append(a, iframe_1);
			/*iframe_1_binding*/ ctx[25](iframe_1);
			append(a, t6);
			append(a, button1);
			append(div4, t8);
			if (if_block1) if_block1.m(div4, null);
			/*div4_binding*/ ctx[26](div4);
		},
		p(ctx, dirty) {
			if (dirty[0] & /*filterLayers*/ 8) {
				each_value_2 = Object.keys(/*filterLayers*/ ctx[3]);
				let i;

				for (i = 0; i < each_value_2.length; i += 1) {
					const child_ctx = get_each_context_2(ctx, each_value_2, i);

					if (each_blocks[i]) {
						each_blocks[i].p(child_ctx, dirty);
					} else {
						each_blocks[i] = create_each_block_2(child_ctx);
						each_blocks[i].c();
						each_blocks[i].m(select, null);
					}
				}

				for (; i < each_blocks.length; i += 1) {
					each_blocks[i].d(1);
				}

				each_blocks.length = each_value_2.length;
			}

			if (/*currLayer*/ ctx[4]) {
				if (if_block0) {
					if_block0.p(ctx, dirty);
				} else {
					if_block0 = create_if_block_1(ctx);
					if_block0.c();
					if_block0.m(div4, t3);
				}
			} else if (if_block0) {
				if_block0.d(1);
				if_block0 = null;
			}

			if (dirty[0] & /*filteredLayerID*/ 512 && a_class_value !== (a_class_value = "exportHref " + (/*filteredLayerID*/ ctx[9] ? "" : "hidden"))) {
				attr(a, "class", a_class_value);
			}

			if (dirty[0] & /*currLayer*/ 16 && div3_class_value !== (div3_class_value = "bottom " + (/*currLayer*/ ctx[4] ? "" : "hidden"))) {
				attr(div3, "class", div3_class_value);
			}

			if (/*error*/ ctx[0]) {
				if (if_block1) {
					if_block1.p(ctx, dirty);
				} else {
					if_block1 = create_if_block(ctx);
					if_block1.c();
					if_block1.m(div4, null);
				}
			} else if (if_block1) {
				if_block1.d(1);
				if_block1 = null;
			}
		},
		i: noop,
		o: noop,
		d(detaching) {
			if (detaching) detach(div4);
			destroy_each(each_blocks, detaching);
			/*div2_binding*/ ctx[23](null);
			if (if_block0) if_block0.d();
			/*iframe_1_binding*/ ctx[25](null);
			if (if_block1) if_block1.d();
			/*div4_binding*/ ctx[26](null);
			run_all(dispose);
		}
	};
}

function instance($$self, $$props, $$invalidate) {
	const leafletMap = getContext("leafletMap");
	const gmxMap = getContext("gmxMap");
	let changedParams = { test: 23 };
	let error = null;
	let waitingIcon = null;
	let content = null;
	let filterLayers = {};

	const getColumnStat = id => {
		let layer = gmxMap.layersByID[id],
			_gmx = layer._gmx,
			props = layer.getGmxProperties(),
			meta = props.MetaProperties,
			promiseArr = [];

		for (var k in meta) {
			if (k !== "filter") {
				if (k in _gmx.tileAttributeIndexes) {
					promiseArr.push(Requests.getColumnStat({ id, column: k }).then(json => {
						if (json.res.ErrorInfo) {
							console.warn(json);
							return {};
						}

						let res = json.res.Result;

						if (res && res.unique) {
							return {
								field: json.queue.params.column,
								datalist: res.unique
							};
						}

						return null;
					}));
				} else {
					console.warn("В слое:", id, " поле:", k, " не существует!");
				}
			}
		}

		return Promise.all(promiseArr);
	};

	gmxMap.layers.forEach(it => {
		let props = it.getGmxProperties(),
			id = props.name,
			meta = props.MetaProperties,
			_gmx = gmxMap.layersByID[id]._gmx,
			out = {
				Title: props.title,
				Description: props.description,
				Copyright: props.Copyright,
				IsRasterCatalog: false,
				TemporalLayer: false,
				filters: {}
			};

		for (var k in meta) {
			if (k === "filter" && meta.filter.Value === "true") {
				out.id = id;
				out.title = props.title;
				out.attr = props.attributes.map(n => "\"" + n + "\" as \"" + n + "\"").join(", ");
			} else {
				if (k in _gmx.tileAttributeIndexes) {
					out.filters[k] = { title: meta[k].Value };
				} else {
					console.warn("В слое:", id, " поле:", k, " не существует!");
				}
			}
		}

		if (out.id) {
			$$invalidate(3, filterLayers[id] = out, filterLayers);
		}
	});

	let currLayer = null;

	const changeLayer = ev => {
		let id = ev ? ev.target.selectedOptions[0].value : null,
			_gmx = gmxMap.layersByID[id];

		$$invalidate(4, currLayer = null);
		waitingIcon.classList.remove("hidden");

		if (id) {
			getColumnStat(id).then(arr => {
				$$invalidate(4, currLayer = filterLayers[id]);
				$$invalidate(0, error = "");

				arr.forEach(it => {
					if (it.field) {
						$$invalidate(4, currLayer.filters[it.field].datalist = it.datalist, currLayer);
					} else {
						$$invalidate(0, error = "Ошибка");
					}
				});

				setHidden(error);
			});
		}
	};

	let drawingButton = null;
	let currDrawingObj = null;
	let currDrawingObjArea = null;

	const privaz = (ev, dObj) => {
		$$invalidate(6, currDrawingObj = dObj || ev.object);

		if (currDrawingObj._map) {
			$$invalidate(7, currDrawingObjArea = currDrawingObj.getSummary());
			clearData();
			$$invalidate(5, drawingButton.checked = true, drawingButton);
			$$invalidate(0, error = "");
		} else {
			$$invalidate(6, currDrawingObj = $$invalidate(7, currDrawingObjArea = null));
		}
	};

	let map = leafletMap;

	map.gmxDrawing.contextmenu.insertItem(
		{
			callback: privaz,
			text: "Привязать к фильтру"
		},
		0,
		"points"
	);

	let drawingChecked = false;

	const createDrawing = ev => {
		$$invalidate(8, drawingChecked = ev.target.checked);
		L.DomEvent.stopPropagation(ev);
		let cont = map.getContainer(), button = ev.target.parentNode;
		$$invalidate(0, error = "");

		if (drawingChecked) {
			cont.style.cursor = "pointer";

			let drawingControl = map.gmxControlsManager.get("drawing"),
				pIcon = drawingControl.getIconById("Polygon");

			drawingControl.setActiveIcon(pIcon, true);
			map.gmxDrawing.on("drawstop", privaz, this);
			map.gmxDrawing.bringToFront();
		} else {
			$$invalidate(6, currDrawingObj = $$invalidate(7, currDrawingObjArea = null));
			cont.style.cursor = "";
			button.classList.remove("drawState");
			map.gmxDrawing.off("drawstop", privaz, this);
			map.gmxDrawing.create();
		}
	};

	const setHidden = err => {
		$$invalidate(0, error = typeof err === "string" ? err : "");
		waitingIcon.classList.add("hidden");
	};

	let filteredLayerID = "";

	const clearData = () => {
		$$invalidate(9, filteredLayerID = "");
	};

	let iframe = null;

	const createExport = ev => {
		Requests.downloadLayer(ev.target.parentNode, filteredLayerID);
	};

	const createFilterLayer = ev => {
		if (drawingChecked && !currDrawingObjArea) {
			$$invalidate(0, error = "Необходимо нарисовать контур");

			let dc = leafletMap.gmxControlsManager.get("drawing"),
				ac = leafletMap.gmxControlsManager.get(dc.activeIcon || "Polygon");

			ac.setActive(false);
			dc.setActiveIcon("", false);
			return;
		}

		let id = currLayer.id,
			layer = gmxMap.layersByID[id],
			props = layer.getGmxProperties(),
			nodes = content.getElementsByTagName("input"),
			pars = { SourceType: "Sql", srs: 3857 },
			arr = [];

		waitingIcon.classList.remove("hidden");

		for (let i = 0, len = nodes.length; i < len; i++) {
			let node = nodes[i], name = node.name, val = node.value;

			if (val && node !== drawingButton) {
				arr.push("\"" + node.name + "\" = '" + val + "'");
				pars.Title = "Объекты недвижимости собственника с ИНН \"" + val + "\" по слою \"" + props.title + "\"";
			}
		}

		pars.styles = props.styles;
		pars.Description = props.description || "";
		pars.Copyright = props.Copyright || "";
		let w = "", alen = arr.length;

		if (currDrawingObj || alen) {
			w = "WHERE ";

			if (currDrawingObj) {
				w += "\"S_FIN\" = 'FS'";
				w += " AND intersects([geomixergeojson], GeometryFromGeoJson('" + JSON.stringify(currDrawingObj.toGeoJSON()) + "', 4326))";
				pars.Title = "Федеральные объекты недвижимости в пределах контура по слою \"" + props.title + "\"";
			} else if (alen) {
				w += "(" + arr.join(") AND (") + ")";
			}
		}

		pars.Sql = "select [geomixergeojson] as gmx_geometry, " + currLayer.attr + ", \"gmx_id\" as \"gmx_id\" from [" + id + "] " + w;

		Requests.createFilterLayer(pars).then(res => {
			if (res.error) {
				setHidden(res.error);
			} else {
				setHidden("Слой создан");
				$$invalidate(9, filteredLayerID = res.content.properties.LayerID);
			}
		});
	};

	function div2_binding($$value) {
		binding_callbacks[$$value ? "unshift" : "push"](() => {
			$$invalidate(1, waitingIcon = $$value);
		});
	}

	function input_binding($$value) {
		binding_callbacks[$$value ? "unshift" : "push"](() => {
			$$invalidate(5, drawingButton = $$value);
		});
	}

	function iframe_1_binding($$value) {
		binding_callbacks[$$value ? "unshift" : "push"](() => {
			$$invalidate(10, iframe = $$value);
		});
	}

	function div4_binding($$value) {
		binding_callbacks[$$value ? "unshift" : "push"](() => {
			$$invalidate(2, content = $$value);
		});
	}

	return [
		error,
		waitingIcon,
		content,
		filterLayers,
		currLayer,
		drawingButton,
		currDrawingObj,
		currDrawingObjArea,
		drawingChecked,
		filteredLayerID,
		iframe,
		changeLayer,
		createDrawing,
		setHidden,
		clearData,
		createExport,
		createFilterLayer,
		leafletMap,
		gmxMap,
		changedParams,
		getColumnStat,
		privaz,
		map,
		div2_binding,
		input_binding,
		iframe_1_binding,
		div4_binding
	];
}

class Filters extends SvelteComponent {
	constructor(options) {
		super();
		init(this, options, instance, create_fragment, safe_not_equal, {}, [-1, -1]);
	}
}

/* src\App.svelte generated by Svelte v3.16.4 */

function create_if_block$1(ctx) {
	let updating_openSidebar;
	let current;

	function filters_openSidebar_binding(value) {
		/*filters_openSidebar_binding*/ ctx[8].call(null, value);
	}

	let filters_props = {};

	if (/*openSidebar*/ ctx[1] !== void 0) {
		filters_props.openSidebar = /*openSidebar*/ ctx[1];
	}

	const filters = new Filters({ props: filters_props });
	binding_callbacks.push(() => bind(filters, "openSidebar", filters_openSidebar_binding));

	return {
		c() {
			create_component(filters.$$.fragment);
		},
		m(target, anchor) {
			mount_component(filters, target, anchor);
			current = true;
		},
		p(ctx, dirty) {
			const filters_changes = {};

			if (!updating_openSidebar && dirty[0] & /*openSidebar*/ 2) {
				updating_openSidebar = true;
				filters_changes.openSidebar = /*openSidebar*/ ctx[1];
				add_flush_callback(() => updating_openSidebar = false);
			}

			filters.$set(filters_changes);
		},
		i(local) {
			if (current) return;
			transition_in(filters.$$.fragment, local);
			current = true;
		},
		o(local) {
			transition_out(filters.$$.fragment, local);
			current = false;
		},
		d(detaching) {
			destroy_component(filters, detaching);
		}
	};
}

function create_fragment$1(ctx) {
	let div;
	let ul;
	let li;
	let a;
	let t0;
	let a_class_value;
	let t1;
	let current;
	let dispose;
	let if_block = /*tab*/ ctx[0] === "filters" && create_if_block$1(ctx);

	return {
		c() {
			div = element("div");
			ul = element("ul");
			li = element("li");
			a = element("a");
			t0 = text("Фильтры");
			t1 = space();
			if (if_block) if_block.c();
			attr(a, "class", a_class_value = "nav-link " + (/*tab*/ ctx[0] === "filters" ? "active" : "-"));
			attr(a, "href", "#filters");
			attr(li, "class", "nav-item");
			attr(ul, "class", "nav nav-tabs");
			attr(div, "class", "domrf-plugin-container");
			dispose = listen(a, "click", /*toggleSidebar*/ ctx[2]);
		},
		m(target, anchor) {
			insert(target, div, anchor);
			append(div, ul);
			append(ul, li);
			append(li, a);
			append(a, t0);
			append(div, t1);
			if (if_block) if_block.m(div, null);
			current = true;
		},
		p(ctx, dirty) {
			if (!current || dirty[0] & /*tab*/ 1 && a_class_value !== (a_class_value = "nav-link " + (/*tab*/ ctx[0] === "filters" ? "active" : "-"))) {
				attr(a, "class", a_class_value);
			}

			if (/*tab*/ ctx[0] === "filters") {
				if (if_block) {
					if_block.p(ctx, dirty);
					transition_in(if_block, 1);
				} else {
					if_block = create_if_block$1(ctx);
					if_block.c();
					transition_in(if_block, 1);
					if_block.m(div, null);
				}
			} else if (if_block) {
				group_outros();

				transition_out(if_block, 1, 1, () => {
					if_block = null;
				});

				check_outros();
			}
		},
		i(local) {
			if (current) return;
			transition_in(if_block);
			current = true;
		},
		o(local) {
			transition_out(if_block);
			current = false;
		},
		d(detaching) {
			if (detaching) detach(div);
			if (if_block) if_block.d();
			dispose();
		}
	};
}

function instance$1($$self, $$props, $$invalidate) {
	let { tab = "filters" } = $$props;
	let { leafletMap } = $$props;
	let { gmxMap } = $$props;
	setContext("leafletMap", leafletMap);
	setContext("gmxMap", gmxMap);

	let toggleBase = () => {
		baseContVisible.update(n => !n);
	};

	let sidebar_num = 1;
	let sidebar_visible = true;

	let toggleSidebar = ev => {
		sidebar_visible = !sidebar_visible;
		let classList = ev.target.classList, className = "rotate180";

		if (classList.contains(className)) {
			classList.remove(className);
		} else {
			classList.add(className);
		}
	};

	let openSidebar = nm => {
		if (sidebar_num === nm) {
			nm = 0;
		}

		sidebar_num = nm;
	};

	function filters_openSidebar_binding(value) {
		openSidebar = value;
		$$invalidate(1, openSidebar);
	}

	$$self.$set = $$props => {
		if ("tab" in $$props) $$invalidate(0, tab = $$props.tab);
		if ("leafletMap" in $$props) $$invalidate(3, leafletMap = $$props.leafletMap);
		if ("gmxMap" in $$props) $$invalidate(4, gmxMap = $$props.gmxMap);
	};

	return [
		tab,
		openSidebar,
		toggleSidebar,
		leafletMap,
		gmxMap,
		sidebar_num,
		sidebar_visible,
		toggleBase,
		filters_openSidebar_binding
	];
}

class App extends SvelteComponent {
	constructor(options) {
		super();
		init(this, options, instance$1, create_fragment$1, safe_not_equal, { tab: 0, leafletMap: 3, gmxMap: 4 });
	}
}

module.exports = App;
//# sourceMappingURL=domrf_1.0.cjs.js.map
