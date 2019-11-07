
(function(l, r) { if (l.getElementById('livereloadscript')) return; r = l.createElement('script'); r.async = 1; r.src = '//' + (window.location.host || 'localhost').split(':')[0] + ':35729/livereload.js?snipver=1'; r.id = 'livereloadscript'; l.head.appendChild(r) })(window.document);
var gmxDomRF = (function (exports) {
    'use strict';

    function noop() { }
    function add_location(element, file, line, column, char) {
        element.__svelte_meta = {
            loc: { file, line, column, char }
        };
    }
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
    function listen(node, event, handler, options) {
        node.addEventListener(event, handler, options);
        return () => node.removeEventListener(event, handler, options);
    }
    function attr(node, attribute, value) {
        if (value == null)
            node.removeAttribute(attribute);
        else
            node.setAttribute(attribute, value);
    }
    function children(element) {
        return Array.from(element.childNodes);
    }
    function custom_event(type, detail) {
        const e = document.createEvent('CustomEvent');
        e.initCustomEvent(type, false, false, detail);
        return e;
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
    function onMount(fn) {
        get_current_component().$$.on_mount.push(fn);
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
        if ($$.fragment) {
            $$.update($$.dirty);
            run_all($$.before_update);
            $$.fragment.p($$.dirty, $$.ctx);
            $$.dirty = null;
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
        if (component.$$.props.indexOf(name) === -1)
            return;
        component.$$.bound[name] = callback;
        callback(component.$$.ctx[name]);
    }
    function mount_component(component, target, anchor) {
        const { fragment, on_mount, on_destroy, after_update } = component.$$;
        fragment.m(target, anchor);
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
        if (component.$$.fragment) {
            run_all(component.$$.on_destroy);
            component.$$.fragment.d(detaching);
            // TODO null out other refs, including component.$$ (but need to
            // preserve final state?)
            component.$$.on_destroy = component.$$.fragment = null;
            component.$$.ctx = {};
        }
    }
    function make_dirty(component, key) {
        if (!component.$$.dirty) {
            dirty_components.push(component);
            schedule_update();
            component.$$.dirty = blank_object();
        }
        component.$$.dirty[key] = true;
    }
    function init(component, options, instance, create_fragment, not_equal, prop_names) {
        const parent_component = current_component;
        set_current_component(component);
        const props = options.props || {};
        const $$ = component.$$ = {
            fragment: null,
            ctx: null,
            // state
            props: prop_names,
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
            dirty: null
        };
        let ready = false;
        $$.ctx = instance
            ? instance(component, props, (key, ret, value = ret) => {
                if ($$.ctx && not_equal($$.ctx[key], $$.ctx[key] = value)) {
                    if ($$.bound[key])
                        $$.bound[key](value);
                    if (ready)
                        make_dirty(component, key);
                }
                return ret;
            })
            : props;
        $$.update();
        ready = true;
        run_all($$.before_update);
        $$.fragment = create_fragment($$.ctx);
        if (options.target) {
            if (options.hydrate) {
                // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                $$.fragment.l(children(options.target));
            }
            else {
                // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                $$.fragment.c();
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

    function dispatch_dev(type, detail) {
        document.dispatchEvent(custom_event(type, detail));
    }
    function append_dev(target, node) {
        dispatch_dev("SvelteDOMInsert", { target, node });
        append(target, node);
    }
    function insert_dev(target, node, anchor) {
        dispatch_dev("SvelteDOMInsert", { target, node, anchor });
        insert(target, node, anchor);
    }
    function detach_dev(node) {
        dispatch_dev("SvelteDOMRemove", { node });
        detach(node);
    }
    function listen_dev(node, event, handler, options, has_prevent_default, has_stop_propagation) {
        const modifiers = options === true ? ["capture"] : options ? Array.from(Object.keys(options)) : [];
        if (has_prevent_default)
            modifiers.push('preventDefault');
        if (has_stop_propagation)
            modifiers.push('stopPropagation');
        dispatch_dev("SvelteDOMAddEventListener", { node, event, handler, modifiers });
        const dispose = listen(node, event, handler, options);
        return () => {
            dispatch_dev("SvelteDOMRemoveEventListener", { node, event, handler, modifiers });
            dispose();
        };
    }
    function attr_dev(node, attribute, value) {
        attr(node, attribute, value);
        if (value == null)
            dispatch_dev("SvelteDOMRemoveAttribute", { node, attribute });
        else
            dispatch_dev("SvelteDOMSetAttribute", { node, attribute, value });
    }
    function prop_dev(node, property, value) {
        node[property] = value;
        dispatch_dev("SvelteDOMSetProperty", { node, property, value });
    }
    function set_data_dev(text, data) {
        data = '' + data;
        if (text.data === data)
            return;
        dispatch_dev("SvelteDOMSetData", { node: text, data });
        text.data = data;
    }
    class SvelteComponentDev extends SvelteComponent {
        constructor(options) {
            if (!options || (!options.target && !options.$$inline)) {
                throw new Error(`'target' is a required option`);
            }
            super();
        }
        $destroy() {
            super.$destroy();
            this.$destroy = () => {
                console.warn(`Component was already destroyed`); // eslint-disable-line no-console
            };
        }
    }

    const subscriber_queue = [];
    /**
     * Create a `Writable` store that allows both updating and reading by subscription.
     * @param {*=}value initial value
     * @param {StartStopNotifier=}start start and stop notifications for subscriptions
     */
    function writable(value, start = noop) {
        let stop;
        const subscribers = [];
        function set(new_value) {
            if (safe_not_equal(value, new_value)) {
                value = new_value;
                if (stop) { // store is ready
                    const run_queue = !subscriber_queue.length;
                    for (let i = 0; i < subscribers.length; i += 1) {
                        const s = subscribers[i];
                        s[1]();
                        subscriber_queue.push(s, value);
                    }
                    if (run_queue) {
                        for (let i = 0; i < subscriber_queue.length; i += 2) {
                            subscriber_queue[i][0](subscriber_queue[i + 1]);
                        }
                        subscriber_queue.length = 0;
                    }
                }
            }
        }
        function update(fn) {
            set(fn(value));
        }
        function subscribe(run, invalidate = noop) {
            const subscriber = [run, invalidate];
            subscribers.push(subscriber);
            if (subscribers.length === 1) {
                stop = start(set) || noop;
            }
            run(value);
            return () => {
                const index = subscribers.indexOf(subscriber);
                if (index !== -1) {
                    subscribers.splice(index, 1);
                }
                if (subscribers.length === 0) {
                    stop();
                    stop = null;
                }
            };
        }
        return { set, update, subscribe };
    }

    // export const Store = {
    	// leafletMap: writable(0),
    	// baseContVisible: writable(0),
    	// mapID: writable(0),
    	// mapTree: writable(0)
    // };
    const leafletMap = writable(0);
    const gmxMap = writable(0);
    const worker = writable(0);
    const kvItems = writable(0);
    const delItems = writable(0);

    /*jslint plusplus:true */
    function Geomag(model) {
    	var wmm,
    		maxord = 12,
    		a = 6378.137,		// WGS 1984 Equatorial axis (km)
    		b = 6356.7523142,	// WGS 1984 Polar axis (km)
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
    		wmm = (function (cof) {
    			var modelLines = cof.split('\n'), wmm = [], i, vals, epoch, model, modelDate;
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

    			return {epoch: epoch, model: model, modelDate: modelDate, wmm: wmm};
    		}(cof));
    	}

    	function unnormalize(wmm) {
    		var i, j, m, n, D2, flnmj,
    			c = [z.slice(), z.slice(), z.slice(), z.slice(), z.slice(), z.slice(),
    				z.slice(), z.slice(), z.slice(), z.slice(), z.slice(), z.slice(),
    				z.slice()],
    			cd = [z.slice(), z.slice(), z.slice(), z.slice(), z.slice(), z.slice(),
    				z.slice(), z.slice(), z.slice(), z.slice(), z.slice(), z.slice(),
    				z.slice()],
    			k = [z.slice(), z.slice(), z.slice(), z.slice(), z.slice(), z.slice(),
    				z.slice(), z.slice(), z.slice(), z.slice(), z.slice(), z.slice(),
    				z.slice()],
    			snorm = [z.slice(), z.slice(), z.slice(), z.slice(), z.slice(),
    				z.slice(), z.slice(), z.slice(), z.slice(), z.slice(), z.slice(),
    				z.slice(), z.slice()],
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

    			for (m = 0, D2 = (n - m + 1); D2 > 0; D2--, m++) {
    				k[m][n] = (((n - 1) * (n - 1)) - (m * m)) /
    					((2 * n - 1) * (2 * n - 3));
    				if (m > 0) {
    					flnmj = ((n - m + 1) * j) / (n + m);
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

    		unnormalizedWMM = {epoch: wmm.epoch, k: k, c: c, cd: cd};
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
    		return {a: a, b: b};
    	};
    	this.calculate = function (glat, glon, h, date) {
    		if (unnormalizedWMM === undefined) {
    			throw new Error("A World Magnetic Model has not been set.")
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
    				daysInYear = 365 +
    					(((year % 400 === 0) || (year % 4 === 0 && (year % 100 > 0))) ? 1 : 0),
    				msInYear = daysInYear * 24 * 60 * 60 * 1000;

    			return date.getFullYear() + (date.valueOf() - (new Date(year, 0)).valueOf()) / msInYear;
    		}

    		var epoch = unnormalizedWMM.epoch,
    			k = unnormalizedWMM.k,
    			c = unnormalizedWMM.c,
    			cd = unnormalizedWMM.cd,
    			alt = (h / 3280.8399) || 0, // convert h (in feet) to kilometers (default, 0 km)
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
    			tc = [z.slice(), z.slice(), z.slice(), z.slice(), z.slice(), z.slice(),
    				z.slice(), z.slice(), z.slice(), z.slice(), z.slice(), z.slice(),
    				z.slice()],
    			sp = z.slice(),
    			cp = z.slice(),
    			pp = z.slice(),
    			p = [z.slice(), z.slice(), z.slice(), z.slice(), z.slice(), z.slice(),
    				z.slice(), z.slice(), z.slice(), z.slice(), z.slice(), z.slice(),
    				z.slice()],
    			dp = [z.slice(), z.slice(), z.slice(), z.slice(), z.slice(), z.slice(),
    				z.slice(), z.slice(), z.slice(), z.slice(), z.slice(), z.slice(),
    				z.slice()],
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
    		q2 = ((q1 + a2) / (q1 + b2)) * ((q1 + a2) / (q1 + b2));
    		ct = srlat / Math.sqrt(q2 * crlat2 + srlat2);
    		st = Math.sqrt(1.0 - (ct * ct));
    		r2 = (alt * alt) + 2.0 * q1 + (a4 - c4 * srlat2) / (q * q);
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
    			for (m = 0, D4 = (n + m + 1); D4 > 0; D4--, m++) {

    		/*
    				COMPUTE UNNORMALIZED ASSOCIATED LEGENDRE POLYNOMIALS
    				AND DERIVATIVES VIA RECURSION RELATIONS
    		*/
    				if (n === m) {
    					p[m][n] = st * p[m - 1][n - 1];
    					dp[m][n] = st * dp[m - 1][n - 1] + ct *
    						p[m - 1][n - 1];
    				} else if (n === 1 && m === 0) {
    					p[m][n] = ct * p[m][n - 1];
    					dp[m][n] = ct * dp[m][n - 1] - st * p[m][n - 1];
    				} else if (n > 1 && n !== m) {
    					if (m > n - 2) { p[m][n - 2] = 0; }
    					if (m > n - 2) { dp[m][n - 2] = 0.0; }
    					p[m][n] = ct * p[m][n - 1] - k[m][n] * p[m][n - 2];
    					dp[m][n] = ct * dp[m][n - 1] - st * p[m][n - 1] -
    						k[m][n] * dp[m][n - 2];
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
    				bp += (fm[m] * temp2 * par);
    				br += (fn[n] * temp1 * par);
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
    					bpp += (fm[m] * temp2 * parp);
    				}
    			}
    		}

    		bp = (st === 0.0 ? bpp : bp / st);
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
    		bh = Math.sqrt((bx * bx) + (by * by));
    		ti = Math.sqrt((bh * bh) + (bz * bz));
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
    			} else if (gv < -180.0) { gv += 360.0; }
    		}

    		return {dec: dec, dip: dip, ti: ti, bh: bh, bx: bx, by: by, bz: bz, lat: glat, lon: glon, gv: gv};
    	};
    	this.calc = this.calculate;
    	this.mag = this.calculate;

    	if (model !== undefined) { // initialize
    		if (typeof model === 'string') { // WMM.COF file
    			parseCof(model);
    			unnormalize(wmm);
    		} else if (typeof model === 'object') { // unnorm obj
    			this.setUnnorm(model);
    		} else {
    			throw new Error("Invalid argument type");
    		}
    	}
    }

    var cof = `
    2010.0            WMM-2010        11/20/2009
  1  0  -29496.6       0.0       11.6        0.0
  1  1   -1586.3    4944.4       16.5      -25.9
  2  0   -2396.6       0.0      -12.1        0.0
  2  1    3026.1   -2707.7       -4.4      -22.5
  2  2    1668.6    -576.1        1.9      -11.8
  3  0    1340.1       0.0        0.4        0.0
  3  1   -2326.2    -160.2       -4.1        7.3
  3  2    1231.9     251.9       -2.9       -3.9
  3  3     634.0    -536.6       -7.7       -2.6
  4  0     912.6       0.0       -1.8        0.0
  4  1     808.9     286.4        2.3        1.1
  4  2     166.7    -211.2       -8.7        2.7
  4  3    -357.1     164.3        4.6        3.9
  4  4      89.4    -309.1       -2.1       -0.8
  5  0    -230.9       0.0       -1.0        0.0
  5  1     357.2      44.6        0.6        0.4
  5  2     200.3     188.9       -1.8        1.8
  5  3    -141.1    -118.2       -1.0        1.2
  5  4    -163.0       0.0        0.9        4.0
  5  5      -7.8     100.9        1.0       -0.6
  6  0      72.8       0.0       -0.2        0.0
  6  1      68.6     -20.8       -0.2       -0.2
  6  2      76.0      44.1       -0.1       -2.1
  6  3    -141.4      61.5        2.0       -0.4
  6  4     -22.8     -66.3       -1.7       -0.6
  6  5      13.2       3.1       -0.3        0.5
  6  6     -77.9      55.0        1.7        0.9
  7  0      80.5       0.0        0.1        0.0
  7  1     -75.1     -57.9       -0.1        0.7
  7  2      -4.7     -21.1       -0.6        0.3
  7  3      45.3       6.5        1.3       -0.1
  7  4      13.9      24.9        0.4       -0.1
  7  5      10.4       7.0        0.3       -0.8
  7  6       1.7     -27.7       -0.7       -0.3
  7  7       4.9      -3.3        0.6        0.3
  8  0      24.4       0.0       -0.1        0.0
  8  1       8.1      11.0        0.1       -0.1
  8  2     -14.5     -20.0       -0.6        0.2
  8  3      -5.6      11.9        0.2        0.4
  8  4     -19.3     -17.4       -0.2        0.4
  8  5      11.5      16.7        0.3        0.1
  8  6      10.9       7.0        0.3       -0.1
  8  7     -14.1     -10.8       -0.6        0.4
  8  8      -3.7       1.7        0.2        0.3
  9  0       5.4       0.0       -0.0        0.0
  9  1       9.4     -20.5       -0.1       -0.0
  9  2       3.4      11.5        0.0       -0.2
  9  3      -5.2      12.8        0.3        0.0
  9  4       3.1      -7.2       -0.4       -0.1
  9  5     -12.4      -7.4       -0.3        0.1
  9  6      -0.7       8.0        0.1       -0.0
  9  7       8.4       2.1       -0.1       -0.2
  9  8      -8.5      -6.1       -0.4        0.3
  9  9     -10.1       7.0       -0.2        0.2
 10  0      -2.0       0.0        0.0        0.0
 10  1      -6.3       2.8       -0.0        0.1
 10  2       0.9      -0.1       -0.1       -0.1
 10  3      -1.1       4.7        0.2        0.0
 10  4      -0.2       4.4       -0.0       -0.1
 10  5       2.5      -7.2       -0.1       -0.1
 10  6      -0.3      -1.0       -0.2       -0.0
 10  7       2.2      -3.9        0.0       -0.1
 10  8       3.1      -2.0       -0.1       -0.2
 10  9      -1.0      -2.0       -0.2        0.0
 10 10      -2.8      -8.3       -0.2       -0.1
 11  0       3.0       0.0        0.0        0.0
 11  1      -1.5       0.2        0.0       -0.0
 11  2      -2.1       1.7       -0.0        0.1
 11  3       1.7      -0.6        0.1        0.0
 11  4      -0.5      -1.8       -0.0        0.1
 11  5       0.5       0.9        0.0        0.0
 11  6      -0.8      -0.4       -0.0        0.1
 11  7       0.4      -2.5       -0.0        0.0
 11  8       1.8      -1.3       -0.0       -0.1
 11  9       0.1      -2.1        0.0       -0.1
 11 10       0.7      -1.9       -0.1       -0.0
 11 11       3.8      -1.8       -0.0       -0.1
 12  0      -2.2       0.0       -0.0        0.0
 12  1      -0.2      -0.9        0.0       -0.0
 12  2       0.3       0.3        0.1        0.0
 12  3       1.0       2.1        0.1       -0.0
 12  4      -0.6      -2.5       -0.1        0.0
 12  5       0.9       0.5       -0.0       -0.0
 12  6      -0.1       0.6        0.0        0.1
 12  7       0.5      -0.0        0.0        0.0
 12  8      -0.4       0.1       -0.0        0.0
 12  9      -0.4       0.3        0.0       -0.0
 12 10       0.2      -0.9        0.0       -0.0
 12 11      -0.8      -0.2       -0.1        0.0
 12 12       0.0       0.9        0.1        0.0
999999999999999999999999999999999999999999999999
999999999999999999999999999999999999999999999999
`;
    var geoMag = new Geomag(cof).mag;

    const _self = self || window,
    		serverBase = (_self.serverBase || 'maps.kosmosnimki.ru').replace(/http.*:\/\//, '').replace(/\//g, '');

    let str = self.location.origin || '',
    	_protocol = str.substring(0, str.indexOf('/')),
    	syncParams = {},
    	fetchOptions = {
    		// method: 'post',
    		// headers: {'Content-type': 'application/x-www-form-urlencoded'},
    		mode: 'cors',
    		redirect: 'follow',
    		credentials: 'include'
    	};

    const parseURLParams = (str) => {
    	let sp = new URLSearchParams(str || location.search),
    		out = {},
    		arr = [];
    	for (let p of sp) {
    		let k = p[0], z = p[1];
    		if (z) {
    			if (!out[k]) {out[k] = [];}
    			out[k].push(z);
    		} else {
    			arr.push(k);
    		}
    	}
    	return {main: arr, keys: out};
    };
    let utils = {
    	extend: function (dest) {
    		var i, j, len, src;

    		for (j = 1, len = arguments.length; j < len; j++) {
    			src = arguments[j];
    			for (i in src) {
    				dest[i] = src[i];
    			}
    		}
    		return dest;
    	},

    	makeTileKeys: function(it, ptiles) {
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
    						tp: {z: t[0], x: t[1], y: t[2], v: t[3], s: t[4], d: t[5]}
    					};
    				} else {
    					tiles[tk] = tile;
    				}
    				newTiles[tk] = true;
    			} else {
    				tiles[tk] = tile;
    			}
    		}
    		return {tiles: tiles, newTiles: newTiles};
    	},

    	getDataSource: function(id, hostName) {
    		// var maps = gmx._maps[hostName];
    		// for (var mID in maps) {
    			// var ds = maps[mID].dataSources[id];
    			// if (ds) { return ds; }
    		// }
    		return null;
    	},

    	getZoomRange: function(info) {
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

    	chkProtocol: function(url) {
    		return url.substr(0, _protocol.length) === _protocol ? url : _protocol + url;
    	},
    	getFormBody: function(par) {
    		return Object.keys(par).map(function(key) { return encodeURIComponent(key) + '=' + encodeURIComponent(par[key]); }).join('&');
    	},
    	chkResponse: function(resp, type) {
    		if (resp.status < 200 || resp.status >= 300) {						// error
    			return Promise.reject(resp);
    		} else {
    			var contentType = resp.headers.get('Content-Type');
    			if (type === 'bitmap') {												// get blob
    				return resp.blob();
    			} else if (contentType.indexOf('application/json') > -1) {				// application/json; charset=utf-8
    				return resp.json();
    			} else if (contentType.indexOf('text/javascript') > -1) {	 			// text/javascript; charset=utf-8
    				return resp.text();
    			// } else if (contentType.indexOf('application/json') > -1) {	 		// application/json; charset=utf-8
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
    	getJson: function(queue) {
    // log('getJson', _protocol, queue, Date.now())
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
    		return fetch(utils.chkProtocol(queue.url), opt)
    		.then(function(res) {
    			return utils.chkResponse(res, options.type);
    		})
    		.then(function(res) {
    			var out = {url: queue.url, queue: queue, load: true, res: res};
    			// if (queue.send) {
    				// handler.workerContext.postMessage(out);
    			// } else {
    				return out;
    			// }
    		})
    		.catch(function(err) {
    			return {url: queue.url, queue: queue, load: false, error: err.toString()};
    			// handler.workerContext.postMessage(out);
    		});
        },

        parseLayerProps: function(prop) {
    		let ph = utils.getTileAttributes(prop);
    		return utils.extend(
    			{
    				properties: prop
    			},
    			utils.getTileAttributes(prop),
    			utils.parseMetaProps(prop)
    		);
        },

        parseMetaProps: function(prop) {
            var meta = prop.MetaProperties || {},
                ph = {};
            ph.dataSource = prop.dataSource || prop.LayerID;
    		if ('parentLayer' in meta) {								// изменить dataSource через MetaProperties
    			ph.dataSource = meta.parentLayer.Value || '';
    		}
    		[
    			'srs',					// проекция слоя
    			'gmxProxy',				// установка прокачивалки
    			'filter',				// фильтр слоя
    			'isGeneralized',		// флаг generalization
    			'isFlatten',			// флаг flatten
    			'multiFilters',			// проверка всех фильтров для обьектов слоя
    			'showScreenTiles',		// показывать границы экранных тайлов
    			'dateBegin',			// фильтр по дате начало периода
    			'dateEnd',				// фильтр по дате окончание периода
    			'shiftX',				// сдвиг всего слоя
    			'shiftY',				// сдвиг всего слоя
    			'shiftXfield',			// сдвиг растров объектов слоя
    			'shiftYfield',			// сдвиг растров объектов слоя
    			'quicklookPlatform',	// тип спутника
    			'quicklookX1',			// точки привязки снимка
    			'quicklookY1',			// точки привязки снимка
    			'quicklookX2',			// точки привязки снимка
    			'quicklookY2',			// точки привязки снимка
    			'quicklookX3',			// точки привязки снимка
    			'quicklookY3',			// точки привязки снимка
    			'quicklookX4',			// точки привязки снимка
    			'quicklookY4'			// точки привязки снимка
    		].forEach((k) => {
    			ph[k] = k in meta ? meta[k].Value : '';
    		});
    		if (ph.gmxProxy.toLowerCase() === 'true') {    // проверка прокачивалки
    			ph.gmxProxy = L.gmx.gmxProxy;
    		}
    		if ('parentLayer' in meta) {  // фильтр слоя		// todo удалить после изменений вов вьювере
    			ph.dataSource = meta.parentLayer.Value || prop.dataSource || '';
    		}

            return ph;
        },

        getTileAttributes: function(prop) {
            var tileAttributeIndexes = {},
                tileAttributeTypes = {};
            if (prop.attributes) {
                var attrs = prop.attributes,
                    attrTypes = prop.attrTypes || null;
                if (prop.identityField) { tileAttributeIndexes[prop.identityField] = 0; }
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
    let _maps = {};
    const getMapTree = (pars) => {
    	pars = pars || {};
    	let hostName = pars.hostName || serverBase,
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
    	})
    		.then(function(json) {
    			let out = parseTree(json.res);
    			_maps[hostName] = _maps[hostName] || {};
    			_maps[hostName][id] = out;
    			return parseTree(out);
    		});
    };

    const _iterateNodeChilds = (node, level, out) => {
    	level = level || 0;
    	out = out || {
    		layers: []
    	};
    	
    	if (node) {
    		let type = node.type,
    			content = node.content,
    			props = content.properties;
    		if (type === 'layer') {
    			let ph = utils.parseLayerProps(props);
    			ph.level = level;
    			if (content.geometry) { ph.geometry = content.geometry; }
    			out.layers.push(ph);
    		} else if (type === 'group') {
    			let childs = content.children || [];
    			out.layers.push({ level: level, group: true, childsLen: childs.length, properties: props });
    			childs.map((it) => {
    				_iterateNodeChilds(it, level + 1, out);
    			});
    		}
    		
    	} else {
    		return out;
    	}
    	return out;
    };

    const parseTree = (json) => {
    	let out = {};
    	if (json.Status === 'error') {
    		out = json;
    	} else if (json.Result && json.Result.content) {
    		out = _iterateNodeChilds(json.Result);
    		out.mapAttr = out.layers.shift();
    	}
    // console.log('______json_out_______', out, json)
    	return out;
    };

    const addDataSource = (pars) => {
    	pars = pars || {};

    	let id = pars.id;
    	if (id) {
    		let hostName = pars.hostName;
    		
    	} else {
    		console.warn('Warning: Specify layer \'id\' and \'hostName\`', pars);
    	}
    	return;
    };

    const removeDataSource = (pars) => {
    	pars = pars || {};

    	let id = pars.id;
    	if (id) {
    		let hostName = pars.hostName;
    		
    	} else {
    		console.warn('Warning: Specify layer \'id\' and \'hostName\`', pars);
    	}
    	//Requests.removeDataSource({id: message.layerID, hostName: message.hostName}).then((json) => {
    	return;
    };

    const getColumnStat = (pars) => {
    	pars = pars || {};
    	let hostName = pars.hostName || serverBase;
    	return utils.getJson({
    		url: '//' + hostName + '/VectorLayer/GetColumnStat',
    		// options: {},
    		params: {
    			layerID: pars.id,
    			column: pars.column,
    			maxUnique: 10000,
    			unique: true
    		}
    	});
    		// .then((json) => {
    			// console.log('GetColumnStat', json);
    		// });
    };

    const chkTask = (id) => {
    	const UPDATE_INTERVAL = 2000;
    	let hostName = serverBase;
    	return new Promise((resolve, reject) => {
    		let interval = setInterval(() => {
    			fetch('//' + hostName + '/AsyncTask.ashx?WrapStyle=None&TaskID=' + id,
    			{
    				mode: 'cors',
    				credentials: 'include'
    			})
    				.then(res => res.json())
    				.then(json => {
    					const { Completed, ErrorInfo } = json.Result;
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

    const createFilterLayer = (pars, opt) => {
    	pars = pars || {};
    	let hostName = pars.hostName || serverBase;
    	return new Promise((resolve) => {
    		utils.getJson({
    			url: '//' + hostName + '/VectorLayer/Insert.ashx',
    			// options: {},
    			params: pars
    		})
    		.then((json) => {
    console.log('createFilterLayer________', json);

    			if (json.res.Status === 'ok') {
    				chkTask(json.res.Result.TaskID)
    				.then(json => {
    					if (json.Status === 'ok') {
    						let contentNode = { type: 'layer', content: json.Result.Result };
    						delete contentNode.content.geometry;
    						let LayerID = contentNode.content.properties.LayerID;
    						window._layersTree.copyHandler(contentNode, $( window._queryMapLayers.buildedTree.firstChild).children("div[MapID]")[0], false, true, () => {
    							resolve(contentNode);
    							// let it = nsGmx.gmxMap.layersByID[LayerID];
    							// if (it && opt.source) {
    								// it.setStyles(opt.source.getStyles());
    							// }
    							// console.log('afterAll ________',nsGmx.gmxMap.layersByID[LayerID], contentNode, pars);
    							
    						});
    					}
    				})
    				.catch(err => console.log(err));
    			}
    		})
    		.catch(err => console.log(err));

    			// let out = parseTree(json.res);
    			// _maps[hostName] = _maps[hostName] || {};
    			// _maps[hostName][id] = out;
    			// return parseTree(out);

    	//Request URL: http://maps.kosmosnimki.ru/VectorLayer/Insert.ashx
    // WrapStyle: message
    // Title: eeee
    // SourceType: Sql
    // Sql: select [geomixergeojson] as gmx_geometry, "Apartment" as "Apartment", "CadCost" as "CadCost", "Category" as "Category", "Code_KLADR" as "Code_KLADR", "Code_OKATO" as "Code_OKATO", "DateCreate" as "DateCreate", "Note" as "Note", "Block_KN" as "Block_KN", "SnglUseKN" as "SnglUseKN", "PostalCode" as "PostalCode", "Region" as "Region", "Assign" as "Assign", "KeyTypOns" as "KeyTypOns", "KeyValOns" as "KeyValOns", "OrBldKN" as "OrBldKN", "OrCnKN" as "OrCnKN", "OrUncKN" as "OrUncKN", "BuildArea" as "BuildArea", "S_REES" as "S_REES", "S_VYP" as "S_VYP", "Flats" as "Flats", "Doc_Code" as "Doc_Code", "Doc_Date" as "Doc_Date", "Doc_Issue" as "Doc_Issue", "Doc_Name" as "Doc_Name", "Enc_Name" as "Enc_Name", "Enc_Type" as "Enc_Type", "Own_Gover" as "Own_Gover", "Own_Organ" as "Own_Organ", "Own_Person" as "Own_Person", "Prev_KN" as "Prev_KN", "RegDate" as "RegDate", "RegNumber" as "RegNumber", "DtCrtOns" as "DtCrtOns", "OksName" as "OksName", "YearBuilt" as "YearBuilt", "YearUsed" as "YearUsed", "Wall" as "Wall", "Floors" as "Floors", "UndFloors" as "UndFloors", "OwnrCdSp" as "OwnrCdSp", "OwnrCdCnt" as "OwnrCdCnt", "Rgstrtn" as "Rgstrtn", "OwnrUr" as "OwnrUr", "OwnrUrInn" as "OwnrUrInn", "OwnrGovRgn" as "OwnrGovRgn", "OwnGovCntr" as "OwnGovCntr", "OwnGovName" as "OwnGovName", "IdSubject" as "IdSubject", "GovCodeSp" as "GovCodeSp", "OwnrUrCd" as "OwnrUrCd", "OwnrUrCnt" as "OwnrUrCnt", "RegIdRec" as "RegIdRec", "RegType" as "RegType", "DateTerm" as "DateTerm", "DocFound" as "DocFound", "GeomType" as "GeomType", "XmlFile" as "XmlFile", "Remove_KN" as "Remove_KN", "S_FIN" as "S_FIN", "S_RZS" as "S_RZS", "SITUAT" as "SITUAT", "S_FS_Flats" as "S_FS_Flats", "Shape_Leng" as "Shape_Leng", "Shape_Area" as "Shape_Area", "Func_Zone" as "Func_Zone", "PermUse" as "PermUse", "gmx_id" as "gmx_id" from [73EEF9D708BB4C54915B6CCB77FDBBF1] WHERE ("S_FIN" = 'FIZ') AND intersects([geomixergeojson], GeometryFromGeoJson('{"type":"Polygon","coordinates":[[[37.286224,55.756486],[37.599335,55.937664],[37.681732,55.565145],[37.286224,55.756486]]]}', 4326))
    // srs: 3857
    // Description: 
    // Copyright: 
    // MetaProperties: {"OwnrUrInn":{"Value":"ИНН","Type":"String"},"S_FIN":{"Value":"Форма собственности","Type":"String"},"filter":{"Value":"true","Type":"String"}}
    // IsRasterCatalog: false
    // NameObject: 
    // TemporalLayer: false
    // CallbackName: id0.70364036522251672
    	});

    };


    var Requests = {
    	getColumnStat,
    	createFilterLayer,

    	addDataSource,
    	removeDataSource,
    	parseURLParams,
    	getMapTree,
    	// getReportsCount,
    	// getLayerItems
    };

    let dataWorker = null;
    worker.subscribe(value => { dataWorker = value; });

    const Utils = {
    	isFilterLayer: (it) => {
    		let out = false;

    		if (it._gmx) {
    			let attr = it._gmx.tileAttributeTypes;
    			out = attr.snap && attr.FRSTAT;
    		}
    		return out;
    	},
    	saveState: (data, key) => {
    		key = key || 'Forest_';
    		window.localStorage.setItem(key, JSON.stringify(data));
    	},
    	getState: key => {
    		key = key || 'Forest_';
    		return JSON.parse(window.localStorage.getItem(key)) || {};
    	},

    	isKvartalLayer: (it) => {
    		let out = false;
    		if (it._gmx) {
    			let attr = it._gmx.tileAttributeTypes;
    			out = attr.kv;
    		}
    		return out;
    	},
    	getLayerItems: (it, opt) => {
    		dataWorker.onmessage = (res) => {
    			let data = res.data,
    				cmd = data.cmd,
    				json = data.out,
    				type = opt && opt.type || 'delynka';

    			if (cmd === 'getLayerItems') {
    				if (type === 'delynka') {
    					delItems.set(json.Result);
    				} else {
    					kvItems.set(json.Result);
    				}
    			}
    			// console.log('onmessage', res);
    		};
    		dataWorker.postMessage({cmd: 'getLayerItems', layerID: it.options.layerID, opt: opt});
    	},
    	getReportsCount: (opt) => {
    		// dataWorker.onmessage = (res) => {
    			// let data = res.data,
    				// cmd = data.cmd,
    				// json = data.out;

    			// if (cmd === 'getReportsCount') {
    				// reportsCount.set(json);
    			// }
    		// };
    		// dataWorker.postMessage({cmd: 'getReportsCount', opt: opt});
    	}
    };

    /* src\Filters\Filters.svelte generated by Svelte v3.12.1 */

    const file = "src\\Filters\\Filters.svelte";

    function get_each_context_1(ctx, list, i) {
    	const child_ctx = Object.create(ctx);
    	child_ctx.pt = list[i];
    	return child_ctx;
    }

    function get_each_context(ctx, list, i) {
    	const child_ctx = Object.create(ctx);
    	child_ctx.field = list[i];
    	return child_ctx;
    }

    function get_each_context_2(ctx, list, i) {
    	const child_ctx = Object.create(ctx);
    	child_ctx.k = list[i];
    	return child_ctx;
    }

    // (298:4) {#each Object.keys(filterLayers) as k}
    function create_each_block_2(ctx) {
    	var option, t_value = ctx.filterLayers[ctx.k].title + "", t, option_value_value;

    	const block = {
    		c: function create() {
    			option = element("option");
    			t = text(t_value);
    			option.__value = option_value_value = ctx.filterLayers[ctx.k].id;
    			option.value = option.__value;
    			add_location(option, file, 298, 4, 8491);
    		},

    		m: function mount(target, anchor) {
    			insert_dev(target, option, anchor);
    			append_dev(option, t);
    		},

    		p: function update(changed, ctx) {
    			if ((changed.filterLayers) && t_value !== (t_value = ctx.filterLayers[ctx.k].title + "")) {
    				set_data_dev(t, t_value);
    			}

    			if ((changed.filterLayers) && option_value_value !== (option_value_value = ctx.filterLayers[ctx.k].id)) {
    				prop_dev(option, "__value", option_value_value);
    			}

    			option.value = option.__value;
    		},

    		d: function destroy(detaching) {
    			if (detaching) {
    				detach_dev(option);
    			}
    		}
    	};
    	dispatch_dev("SvelteRegisterBlock", { block, id: create_each_block_2.name, type: "each", source: "(298:4) {#each Object.keys(filterLayers) as k}", ctx });
    	return block;
    }

    // (305:0) {#if currLayer}
    function create_if_block(ctx) {
    	var t0, div1, div0, input, label, t2, dispose;

    	let each_value = Object.keys(ctx.currLayer.filters);

    	let each_blocks = [];

    	for (let i = 0; i < each_value.length; i += 1) {
    		each_blocks[i] = create_each_block(get_each_context(ctx, each_value, i));
    	}

    	var if_block = (ctx.currDrawingObj) && create_if_block_1(ctx);

    	const block = {
    		c: function create() {
    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].c();
    			}

    			t0 = space();
    			div1 = element("div");
    			div0 = element("div");
    			input = element("input");
    			label = element("label");
    			label.textContent = "Поиск по пересечению с объектом";
    			t2 = space();
    			if (if_block) if_block.c();
    			attr_dev(input, "type", "checkbox");
    			attr_dev(input, "name", "checkboxG4");
    			attr_dev(input, "id", "checkboxG4");
    			attr_dev(input, "class", "css-checkbox2");
    			attr_dev(input, "title", "Нарисовать или выбрать объект по правой кнопке на вершине");
    			add_location(input, file, 323, 5, 9116);
    			attr_dev(label, "for", "checkboxG4");
    			attr_dev(label, "class", "css-label2 radGroup1");
    			add_location(label, file, 323, 205, 9316);
    			attr_dev(div0, "class", "checkbox");
    			add_location(div0, file, 322, 2, 9087);
    			attr_dev(div1, "class", "row");
    			add_location(div1, file, 321, 1, 9066);
    			dispose = listen_dev(input, "change", ctx.createDrawing);
    		},

    		m: function mount(target, anchor) {
    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].m(target, anchor);
    			}

    			insert_dev(target, t0, anchor);
    			insert_dev(target, div1, anchor);
    			append_dev(div1, div0);
    			append_dev(div0, input);
    			ctx.input_binding(input);
    			append_dev(div0, label);
    			append_dev(div0, t2);
    			if (if_block) if_block.m(div0, null);
    		},

    		p: function update(changed, ctx) {
    			if (changed.currLayer) {
    				each_value = Object.keys(ctx.currLayer.filters);

    				let i;
    				for (i = 0; i < each_value.length; i += 1) {
    					const child_ctx = get_each_context(ctx, each_value, i);

    					if (each_blocks[i]) {
    						each_blocks[i].p(changed, child_ctx);
    					} else {
    						each_blocks[i] = create_each_block(child_ctx);
    						each_blocks[i].c();
    						each_blocks[i].m(t0.parentNode, t0);
    					}
    				}

    				for (; i < each_blocks.length; i += 1) {
    					each_blocks[i].d(1);
    				}
    				each_blocks.length = each_value.length;
    			}

    			if (ctx.currDrawingObj) {
    				if (if_block) {
    					if_block.p(changed, ctx);
    				} else {
    					if_block = create_if_block_1(ctx);
    					if_block.c();
    					if_block.m(div0, null);
    				}
    			} else if (if_block) {
    				if_block.d(1);
    				if_block = null;
    			}
    		},

    		d: function destroy(detaching) {
    			destroy_each(each_blocks, detaching);

    			if (detaching) {
    				detach_dev(t0);
    				detach_dev(div1);
    			}

    			ctx.input_binding(null);
    			if (if_block) if_block.d();
    			dispose();
    		}
    	};
    	dispatch_dev("SvelteRegisterBlock", { block, id: create_if_block.name, type: "if", source: "(305:0) {#if currLayer}", ctx });
    	return block;
    }

    // (311:2) {#if currLayer.filters[field].datalist}
    function create_if_block_2(ctx) {
    	var datalist, datalist_id_value;

    	let each_value_1 = ctx.currLayer.filters[ctx.field].datalist;

    	let each_blocks = [];

    	for (let i = 0; i < each_value_1.length; i += 1) {
    		each_blocks[i] = create_each_block_1(get_each_context_1(ctx, each_value_1, i));
    	}

    	const block = {
    		c: function create() {
    			datalist = element("datalist");

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].c();
    			}
    			attr_dev(datalist, "id", datalist_id_value = ctx.field);
    			add_location(datalist, file, 311, 3, 8883);
    		},

    		m: function mount(target, anchor) {
    			insert_dev(target, datalist, anchor);

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].m(datalist, null);
    			}
    		},

    		p: function update(changed, ctx) {
    			if (changed.currLayer) {
    				each_value_1 = ctx.currLayer.filters[ctx.field].datalist;

    				let i;
    				for (i = 0; i < each_value_1.length; i += 1) {
    					const child_ctx = get_each_context_1(ctx, each_value_1, i);

    					if (each_blocks[i]) {
    						each_blocks[i].p(changed, child_ctx);
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

    			if ((changed.currLayer) && datalist_id_value !== (datalist_id_value = ctx.field)) {
    				attr_dev(datalist, "id", datalist_id_value);
    			}
    		},

    		d: function destroy(detaching) {
    			if (detaching) {
    				detach_dev(datalist);
    			}

    			destroy_each(each_blocks, detaching);
    		}
    	};
    	dispatch_dev("SvelteRegisterBlock", { block, id: create_if_block_2.name, type: "if", source: "(311:2) {#if currLayer.filters[field].datalist}", ctx });
    	return block;
    }

    // (313:4) {#each currLayer.filters[field].datalist as pt}
    function create_each_block_1(ctx) {
    	var option, option_value_value;

    	const block = {
    		c: function create() {
    			option = element("option");
    			option.__value = option_value_value = ctx.pt.value;
    			option.value = option.__value;
    			add_location(option, file, 313, 4, 8965);
    		},

    		m: function mount(target, anchor) {
    			insert_dev(target, option, anchor);
    		},

    		p: function update(changed, ctx) {
    			if ((changed.currLayer) && option_value_value !== (option_value_value = ctx.pt.value)) {
    				prop_dev(option, "__value", option_value_value);
    			}

    			option.value = option.__value;
    		},

    		d: function destroy(detaching) {
    			if (detaching) {
    				detach_dev(option);
    			}
    		}
    	};
    	dispatch_dev("SvelteRegisterBlock", { block, id: create_each_block_1.name, type: "each", source: "(313:4) {#each currLayer.filters[field].datalist as pt}", ctx });
    	return block;
    }

    // (306:1) {#each Object.keys(currLayer.filters) as field}
    function create_each_block(ctx) {
    	var div2, div0, t0_value = ctx.currLayer.filters[ctx.field].title + "", t0, t1, div1, input, input_name_value, input_list_value, t2;

    	var if_block = (ctx.currLayer.filters[ctx.field].datalist) && create_if_block_2(ctx);

    	const block = {
    		c: function create() {
    			div2 = element("div");
    			div0 = element("div");
    			t0 = text(t0_value);
    			t1 = space();
    			div1 = element("div");
    			input = element("input");
    			t2 = space();
    			if (if_block) if_block.c();
    			attr_dev(div0, "class", "title");
    			add_location(div0, file, 307, 2, 8699);
    			attr_dev(input, "type", "text");
    			attr_dev(input, "name", input_name_value = ctx.field);
    			attr_dev(input, "list", input_list_value = ctx.field);
    			add_location(input, file, 309, 3, 8784);
    			attr_dev(div1, "class", "input");
    			add_location(div1, file, 308, 2, 8760);
    			attr_dev(div2, "class", "row");
    			add_location(div2, file, 306, 1, 8678);
    		},

    		m: function mount(target, anchor) {
    			insert_dev(target, div2, anchor);
    			append_dev(div2, div0);
    			append_dev(div0, t0);
    			append_dev(div2, t1);
    			append_dev(div2, div1);
    			append_dev(div1, input);
    			append_dev(div1, t2);
    			if (if_block) if_block.m(div1, null);
    		},

    		p: function update(changed, ctx) {
    			if ((changed.currLayer) && t0_value !== (t0_value = ctx.currLayer.filters[ctx.field].title + "")) {
    				set_data_dev(t0, t0_value);
    			}

    			if ((changed.currLayer) && input_name_value !== (input_name_value = ctx.field)) {
    				attr_dev(input, "name", input_name_value);
    			}

    			if ((changed.currLayer) && input_list_value !== (input_list_value = ctx.field)) {
    				attr_dev(input, "list", input_list_value);
    			}

    			if (ctx.currLayer.filters[ctx.field].datalist) {
    				if (if_block) {
    					if_block.p(changed, ctx);
    				} else {
    					if_block = create_if_block_2(ctx);
    					if_block.c();
    					if_block.m(div1, null);
    				}
    			} else if (if_block) {
    				if_block.d(1);
    				if_block = null;
    			}
    		},

    		d: function destroy(detaching) {
    			if (detaching) {
    				detach_dev(div2);
    			}

    			if (if_block) if_block.d();
    		}
    	};
    	dispatch_dev("SvelteRegisterBlock", { block, id: create_each_block.name, type: "each", source: "(306:1) {#each Object.keys(currLayer.filters) as field}", ctx });
    	return block;
    }

    // (325:3) {#if currDrawingObj}
    function create_if_block_1(ctx) {
    	var span, t;

    	const block = {
    		c: function create() {
    			span = element("span");
    			t = text(ctx.currDrawingObjArea);
    			attr_dev(span, "class", "currDrawingObjArea");
    			add_location(span, file, 325, 3, 9438);
    		},

    		m: function mount(target, anchor) {
    			insert_dev(target, span, anchor);
    			append_dev(span, t);
    		},

    		p: function update(changed, ctx) {
    			if (changed.currDrawingObjArea) {
    				set_data_dev(t, ctx.currDrawingObjArea);
    			}
    		},

    		d: function destroy(detaching) {
    			if (detaching) {
    				detach_dev(span);
    			}
    		}
    	};
    	dispatch_dev("SvelteRegisterBlock", { block, id: create_if_block_1.name, type: "if", source: "(325:3) {#if currDrawingObj}", ctx });
    	return block;
    }

    function create_fragment(ctx) {
    	var div4, div2, div0, t1, div1, select, option, t2, t3, div3, button0, t5, button1, div3_disabled_value, dispose;

    	let each_value_2 = Object.keys(ctx.filterLayers);

    	let each_blocks = [];

    	for (let i = 0; i < each_value_2.length; i += 1) {
    		each_blocks[i] = create_each_block_2(get_each_context_2(ctx, each_value_2, i));
    	}

    	var if_block = (ctx.currLayer) && create_if_block(ctx);

    	const block = {
    		c: function create() {
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
    			if (if_block) if_block.c();
    			t3 = space();
    			div3 = element("div");
    			button0 = element("button");
    			button0.textContent = "Создать слой по фильтру";
    			t5 = space();
    			button1 = element("button");
    			button1.textContent = "Экспорт в Excel";
    			attr_dev(div0, "class", "title");
    			add_location(div0, file, 293, 2, 8321);
    			option.__value = "";
    			option.value = option.__value;
    			add_location(option, file, 296, 4, 8422);
    			add_location(select, file, 295, 3, 8384);
    			attr_dev(div1, "class", "input");
    			add_location(div1, file, 294, 2, 8360);
    			attr_dev(div2, "class", "row");
    			add_location(div2, file, 292, 1, 8300);
    			attr_dev(button0, "class", "button");
    			add_location(button0, file, 332, 2, 9625);
    			attr_dev(button1, "class", "button");
    			add_location(button1, file, 333, 2, 9715);
    			attr_dev(div3, "class", "bottom");
    			attr_dev(div3, "disabled", div3_disabled_value = ctx.currLayer ? false : true);
    			add_location(div3, file, 331, 1, 9540);
    			attr_dev(div4, "class", "sidebar-opened");
    			add_location(div4, file, 291, 0, 8249);

    			dispose = [
    				listen_dev(select, "change", ctx.changeLayer),
    				listen_dev(button0, "click", ctx.createFilterLayer),
    				listen_dev(button1, "click", ctx.createExport)
    			];
    		},

    		l: function claim(nodes) {
    			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
    		},

    		m: function mount(target, anchor) {
    			insert_dev(target, div4, anchor);
    			append_dev(div4, div2);
    			append_dev(div2, div0);
    			append_dev(div2, t1);
    			append_dev(div2, div1);
    			append_dev(div1, select);
    			append_dev(select, option);

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].m(select, null);
    			}

    			append_dev(div4, t2);
    			if (if_block) if_block.m(div4, null);
    			append_dev(div4, t3);
    			append_dev(div4, div3);
    			append_dev(div3, button0);
    			append_dev(div3, t5);
    			append_dev(div3, button1);
    			ctx.div3_binding(div3);
    			ctx.div4_binding(div4);
    		},

    		p: function update(changed, ctx) {
    			if (changed.filterLayers) {
    				each_value_2 = Object.keys(ctx.filterLayers);

    				let i;
    				for (i = 0; i < each_value_2.length; i += 1) {
    					const child_ctx = get_each_context_2(ctx, each_value_2, i);

    					if (each_blocks[i]) {
    						each_blocks[i].p(changed, child_ctx);
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

    			if (ctx.currLayer) {
    				if (if_block) {
    					if_block.p(changed, ctx);
    				} else {
    					if_block = create_if_block(ctx);
    					if_block.c();
    					if_block.m(div4, t3);
    				}
    			} else if (if_block) {
    				if_block.d(1);
    				if_block = null;
    			}

    			if ((changed.currLayer) && div3_disabled_value !== (div3_disabled_value = ctx.currLayer ? false : true)) {
    				attr_dev(div3, "disabled", div3_disabled_value);
    			}
    		},

    		i: noop,
    		o: noop,

    		d: function destroy(detaching) {
    			if (detaching) {
    				detach_dev(div4);
    			}

    			destroy_each(each_blocks, detaching);

    			if (if_block) if_block.d();
    			ctx.div3_binding(null);
    			ctx.div4_binding(null);
    			run_all(dispose);
    		}
    	};
    	dispatch_dev("SvelteRegisterBlock", { block, id: create_fragment.name, type: "component", source: "", ctx });
    	return block;
    }

    function instance($$self, $$props, $$invalidate) {
    	
    	// import SelectInput from './SelectInput.svelte';

    const stateStorage = Utils.getState();
    let changedParams = {test: 23};

    let exportButton = null;
    let content = null;

    let filterLayers = {};
    const getColumnStat = (id) => {
    	let layer = gmxMap$1.layersByID[id],
    		_gmx = layer._gmx,
    		props = layer.getGmxProperties(),
    		meta = props.MetaProperties,
    		promiseArr = [];

    	for (var k in meta) {
    		if (k !== 'filter') {
    			if (k in _gmx.tileAttributeIndexes) {
    				// let f = {field: k, title: meta[k].Value};
    				// out.filters.push(f);
    					promiseArr.push(Requests.getColumnStat({id: id, column: k}).then((json) => {
    						let res = json.res.Result;
    						if (res && res.unique) {
    							//f.datalist = res.unique;
    							return {field: json.queue.params.column, datalist: res.unique};
    						}
    						return null;
    		// console.log('getCol111umnStat', out);
    					}));
    			} else {
    				console.warn('В слое:', id, ' поле:', k, ' не существует!');
    			}
    		}
    	}
    	return Promise.all(promiseArr);
    		// .then(resolve, function(ev) {
     // console.log('_getTileRasters', ev)
    		// });
    	
    	// if (out.id) {
    		// filterLayers[id] = out;
    	// }
    	
    	// return promiseArr;
    };
    let gmxMap$1 = null; gmxMap.subscribe(value => {
    	gmxMap$1 = value;
    	gmxMap$1.layers.forEach((it) => {
    		let props = it.getGmxProperties(),
    			id = props.name,
    			meta = props.MetaProperties,
    			_gmx = gmxMap$1.layersByID[id]._gmx,
    			out = {
    				Title: props.title,
    				Description: props.description,
    				Copyright: props.Copyright,
    				IsRasterCatalog: false,
    				TemporalLayer: false,
    				filters: {}
    			};
    			
    		for (var k in meta) {
    			if (k === 'filter' && meta.filter.Value === 'true') {
    				out.id = id;
    				out.title = props.title;
    				out.attr = props.attributes.map((n) => '"' + n + '" as "' + n + '"').join(', ');
    			} else {
    				if (k in _gmx.tileAttributeIndexes) {
    					out.filters[k] = {title: meta[k].Value};
    				} else {
    					console.warn('В слое:', id, ' поле:', k, ' не существует!');
    				}
    			}
    		}
    		if (out.id) {
    			$$invalidate('filterLayers', filterLayers[id] = out, filterLayers);
    		}
    		console.log('gmxMap', it);
    	});
    	// */
    });

    let currLayer = null;
    const changeLayer = (ev) => {
    	let id = ev ? ev.target.selectedOptions[0].value : null,
    		_gmx = gmxMap$1.layersByID[id];
    	if (id) {
    		getColumnStat(id).then((arr) => {
    			$$invalidate('currLayer', currLayer = filterLayers[id]);
    			arr.forEach((it) => {
    				$$invalidate('currLayer', currLayer.filters[it.field].datalist = it.datalist, currLayer);
    			});
    			console.log('________', currLayer, arr);
    			// arr.
    		});
    	} else {
    		$$invalidate('currLayer', currLayer = null);
    		
    	}
    console.log('changeLayer', id, filterLayers[id], gmxMap$1.layersByID[id]);
    };

    let drawingButton = null;
    let currDrawingObj = null;
    let currDrawingObjArea = null;
    const privaz = (ev, dObj) => {
    console.log('privaz', ev, dObj);
    	$$invalidate('currDrawingObj', currDrawingObj = dObj);
    	$$invalidate('currDrawingObjArea', currDrawingObjArea = dObj.getSummary());
    	// currDrawingObjArea = L.gmxUtil.geoJSONGetArea(dObj.toGeoJSON());
    	
    	$$invalidate('drawingButton', drawingButton.checked = true, drawingButton);
    };

    let map = null; leafletMap.subscribe(value => {
    	map = value;
    	map.gmxDrawing.contextmenu.insertItem({callback: privaz, text: 'Привязать к фильтру'}, 0, 'points');
    });

    let drawingChecked = false;
    const createDrawing = (ev) => {
    	drawingChecked = ev.target.checked;
    	L.DomEvent.stopPropagation(ev);
    	let cont = map.getContainer(),
    		button = ev.target.parentNode;

    	if (drawingChecked) {
    		//map.gmxDrawing.getFeatures();
    		cont.style.cursor = 'pointer';
    		
    		let drawingControl = map.gmxControlsManager.get('drawing'),
    			pIcon = drawingControl.getIconById('Polygon');
    		drawingControl.setActiveIcon(pIcon, true);
    		//button.classList.add('drawState');
    		map.gmxDrawing.on('drawstop', (ev) => {
    			privaz(null, ev.object);
    console.log('drawstop', ev );
    			//button.classList.remove('drawState');
    		}, this);
    		//map.options.snaping = 30;
    		map.gmxDrawing.bringToFront();
    		// map.gmxDrawing.create('Polygon', {
    			// lineStyle: {color: 'green'},
    			// pointStyle: {color: 'green'}
    		// });
    	} else {
    		$$invalidate('currDrawingObj', currDrawingObj = $$invalidate('currDrawingObjArea', currDrawingObjArea = null));
    		cont.style.cursor = '';
    		button.classList.remove('drawState');
    		map.gmxDrawing.off('drawstop', () => {
    console.log('drawstop1', ev );
    			//button.classList.remove('drawState');
    		}, this);
    		map.gmxDrawing.create();
    	}
    };

    /*
    let reportCounts = 0; Store.reportsCount.subscribe(json => {
    	let count = json.limit - json.used;
    	reportCounts = count > 0 ? count : 0;
    });
    Utils.getReportsCount()

    let delynkaLayer = null;
    let kvartalLayer = null;
    const _setLayer = (id) => {
    	let it = gmxMap.layersByID[id],
    		bbox = it.getBounds();
    	// if (addDelynkaFlag !== 1) {
    		map.fitBounds(bbox);
    	// }
    	map.addLayer(it);
    	return it;
    };

    let delItems = null;
    Store.delItems.subscribe(value => {
     delItems = value;
     	 console.log('delItems', delItems);

    });

    const _closeNotice = (nm) => {
    	let name = 'notice-create-report',
    		node;
    	if (!nm || nm === 0) {
    		node = document.getElementsByClassName(name)[0];
    		if (node) { node.classList.add('hidden'); }
    	}
    	if (!nm || nm > 0) {
    		node = document.getElementsByClassName(name + nm)[0];
    		if (node) { node.classList.add('hidden'); }
    	}
    };
    const fitBounds = (nm) => {
    	let arr = delItems.values[nm],
    		geo = arr[arr.length - 1],
    		bbox = L.gmxUtil.getGeometryBounds(geo),
    		latlngBbox = L.latLngBounds([[bbox.min.y, bbox.min.x], [bbox.max.y, bbox.max.x]]);
    	map.fitBounds(latlngBbox);
    	//console.log('fitBounds', nm, geo);
    };
    const toggleDelyanka = (ev) => {
    	let arr = document.getElementsByClassName('selectDelyanka'),
    		ctrlKey = ev.ctrlKey,
    		checked = ev.target.checked;

    	for (let i = 0, len = arr.length; i < len; i++) {
    		arr[i].checked = ctrlKey ? !arr[i].checked : checked;
    	}
    	console.log('toggleDelyanka', checked, arr);
    };

    let reportIsOpen = null;
    const openReport = (ev) => {
    	if (delynkaLayer) {
    		reportIsOpen = true;
    		_closeNotice();
    		// console.log('openReport', delynkaLayer);
    	}
    };
    const closeReport = (ev) => { reportIsOpen = null; };

    const toggleHint = (ev) => {
    	let target = ev.target,
    		name = 'notice-create-report' + (target.classList.contains('icon-report') ? '' : '1'),
    		node = document.getElementsByClassName(name)[0];
    	if (node.classList.contains('hidden')) {
    		node.classList.remove('hidden');
    	} else {
    		node.classList.add('hidden');
    	}
    };
    */
    const createExport = (ev) => {
    	let nodes = content.getElementsByTagName('input'),
    		arr = [];
    	console.log('createExport', exportButton, content, arr.join(' , ') );
    };

    const createFilterLayer = (ev) => {
    	let id = currLayer.id,
    		layer = gmxMap$1.layersByID[id],
    		props = layer.getGmxProperties(),
    		nodes = content.getElementsByTagName('input'),
    		pars = {SourceType: 'Sql', srs: 3857},
    		arr = [];
    	for (let i = 0, len = nodes.length; i < len; i++) {
    		let node = nodes[i],
    			name = node.name,
    			val = node.value;
    		if (val && node !== drawingButton) {
    			arr.push('"' + node.name + '" = \'' + val + '\'');
    		}
    	}
    	pars.Title = 'Фильтр ' + arr.join(', ') + ' по слою "' + props.title + '"';
    	pars.styles = props.styles;
    	pars.Description = props.Description;
    	pars.Copyright = props.Copyright;
    	pars.IsRasterCatalog = false;
    	pars.TemporalLayer = false;

    	let w = 'WHERE (' + arr.join(') AND (') + ')';
    	if (currDrawingObj) {
    		w += ' AND intersects([geomixergeojson], GeometryFromGeoJson(\'' + JSON.stringify(currDrawingObj.toGeoJSON()) + '\', 4326))';
    	}
    	pars.Sql = 'select [geomixergeojson] as gmx_geometry, ' + currLayer.attr + ', "gmx_id" as "gmx_id" from [' + id + '] ' + w;

    	Requests.createFilterLayer(pars).then((res) => {
    console.log('afterAll 111 ________', res);
    		let LayerID = res.content.properties.LayerID,
    			it = gmxMap$1.layersByID[LayerID];
    							// if (it && opt.source) {
    		it.setStyles(layer.getStyles());
    							// }
    	});
    //	console.log('createFilterLayer', exportButton, content, arr.join(' , ') );
    };

    	function input_binding($$value) {
    		binding_callbacks[$$value ? 'unshift' : 'push'](() => {
    			$$invalidate('drawingButton', drawingButton = $$value);
    		});
    	}

    	function div3_binding($$value) {
    		binding_callbacks[$$value ? 'unshift' : 'push'](() => {
    			$$invalidate('exportButton', exportButton = $$value);
    		});
    	}

    	function div4_binding($$value) {
    		binding_callbacks[$$value ? 'unshift' : 'push'](() => {
    			$$invalidate('content', content = $$value);
    		});
    	}

    	$$self.$capture_state = () => {
    		return {};
    	};

    	$$self.$inject_state = $$props => {
    		if ('changedParams' in $$props) changedParams = $$props.changedParams;
    		if ('exportButton' in $$props) $$invalidate('exportButton', exportButton = $$props.exportButton);
    		if ('content' in $$props) $$invalidate('content', content = $$props.content);
    		if ('filterLayers' in $$props) $$invalidate('filterLayers', filterLayers = $$props.filterLayers);
    		if ('gmxMap' in $$props) gmxMap$1 = $$props.gmxMap;
    		if ('currLayer' in $$props) $$invalidate('currLayer', currLayer = $$props.currLayer);
    		if ('drawingButton' in $$props) $$invalidate('drawingButton', drawingButton = $$props.drawingButton);
    		if ('currDrawingObj' in $$props) $$invalidate('currDrawingObj', currDrawingObj = $$props.currDrawingObj);
    		if ('currDrawingObjArea' in $$props) $$invalidate('currDrawingObjArea', currDrawingObjArea = $$props.currDrawingObjArea);
    		if ('map' in $$props) map = $$props.map;
    		if ('drawingChecked' in $$props) drawingChecked = $$props.drawingChecked;
    	};

    	return {
    		exportButton,
    		content,
    		filterLayers,
    		currLayer,
    		changeLayer,
    		drawingButton,
    		currDrawingObj,
    		currDrawingObjArea,
    		createDrawing,
    		createExport,
    		createFilterLayer,
    		input_binding,
    		div3_binding,
    		div4_binding
    	};
    }

    class Filters extends SvelteComponentDev {
    	constructor(options) {
    		super(options);
    		init(this, options, instance, create_fragment, safe_not_equal, []);
    		dispatch_dev("SvelteRegisterComponent", { component: this, tagName: "Filters", options, id: create_fragment.name });
    	}
    }

    /* src\App.svelte generated by Svelte v3.12.1 */

    const file$1 = "src\\App.svelte";

    // (69:0) {:else}
    function create_else_block(ctx) {
    	const block = {
    		c: noop,
    		m: noop,
    		p: noop,
    		i: noop,
    		o: noop,
    		d: noop
    	};
    	dispatch_dev("SvelteRegisterBlock", { block, id: create_else_block.name, type: "else", source: "(69:0) {:else}", ctx });
    	return block;
    }

    // (68:26) 
    function create_if_block_1$1(ctx) {
    	const block = {
    		c: noop,
    		m: noop,
    		p: noop,
    		i: noop,
    		o: noop,
    		d: noop
    	};
    	dispatch_dev("SvelteRegisterBlock", { block, id: create_if_block_1$1.name, type: "if", source: "(68:26) ", ctx });
    	return block;
    }

    // (66:0) {#if tab === 'filters'}
    function create_if_block$1(ctx) {
    	var updating_openSidebar, current;

    	function filters_openSidebar_binding(value) {
    		ctx.filters_openSidebar_binding.call(null, value);
    		updating_openSidebar = true;
    		add_flush_callback(() => updating_openSidebar = false);
    	}

    	let filters_props = {};
    	if (ctx.openSidebar !== void 0) {
    		filters_props.openSidebar = ctx.openSidebar;
    	}
    	var filters = new Filters({ props: filters_props, $$inline: true });

    	binding_callbacks.push(() => bind(filters, 'openSidebar', filters_openSidebar_binding));

    	const block = {
    		c: function create() {
    			filters.$$.fragment.c();
    		},

    		m: function mount(target, anchor) {
    			mount_component(filters, target, anchor);
    			current = true;
    		},

    		p: function update(changed, ctx) {
    			var filters_changes = {};
    			if (!updating_openSidebar && changed.openSidebar) {
    				filters_changes.openSidebar = ctx.openSidebar;
    			}
    			filters.$set(filters_changes);
    		},

    		i: function intro(local) {
    			if (current) return;
    			transition_in(filters.$$.fragment, local);

    			current = true;
    		},

    		o: function outro(local) {
    			transition_out(filters.$$.fragment, local);
    			current = false;
    		},

    		d: function destroy(detaching) {
    			destroy_component(filters, detaching);
    		}
    	};
    	dispatch_dev("SvelteRegisterBlock", { block, id: create_if_block$1.name, type: "if", source: "(66:0) {#if tab === 'filters'}", ctx });
    	return block;
    }

    function create_fragment$1(ctx) {
    	var div, ul, li, a, t0, a_class_value, t1, current_block_type_index, if_block, current, dispose;

    	var if_block_creators = [
    		create_if_block$1,
    		create_if_block_1$1,
    		create_else_block
    	];

    	var if_blocks = [];

    	function select_block_type(changed, ctx) {
    		if (ctx.tab === 'filters') return 0;
    		if (ctx.tab === 'kvart') return 1;
    		return 2;
    	}

    	current_block_type_index = select_block_type(null, ctx);
    	if_block = if_blocks[current_block_type_index] = if_block_creators[current_block_type_index](ctx);

    	const block = {
    		c: function create() {
    			div = element("div");
    			ul = element("ul");
    			li = element("li");
    			a = element("a");
    			t0 = text("Фильтры");
    			t1 = space();
    			if_block.c();
    			attr_dev(a, "class", a_class_value = "nav-link " + (ctx.tab === 'filters' ? 'active' : '-'));
    			attr_dev(a, "href", "#tab2");
    			attr_dev(a, "data-toggle", "tab");
    			add_location(a, file$1, 61, 3, 1705);
    			attr_dev(li, "class", "nav-item");
    			add_location(li, file$1, 60, 2, 1679);
    			attr_dev(ul, "class", "nav nav-tabs");
    			add_location(ul, file$1, 59, 1, 1650);
    			attr_dev(div, "class", "domrf-plugin-container");
    			add_location(div, file$1, 58, 0, 1611);
    			dispose = listen_dev(a, "click", ctx.toggleSidebar);
    		},

    		l: function claim(nodes) {
    			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
    		},

    		m: function mount(target, anchor) {
    			insert_dev(target, div, anchor);
    			append_dev(div, ul);
    			append_dev(ul, li);
    			append_dev(li, a);
    			append_dev(a, t0);
    			append_dev(div, t1);
    			if_blocks[current_block_type_index].m(div, null);
    			current = true;
    		},

    		p: function update(changed, ctx) {
    			if ((!current || changed.tab) && a_class_value !== (a_class_value = "nav-link " + (ctx.tab === 'filters' ? 'active' : '-'))) {
    				attr_dev(a, "class", a_class_value);
    			}

    			var previous_block_index = current_block_type_index;
    			current_block_type_index = select_block_type(changed, ctx);
    			if (current_block_type_index === previous_block_index) {
    				if_blocks[current_block_type_index].p(changed, ctx);
    			} else {
    				group_outros();
    				transition_out(if_blocks[previous_block_index], 1, 1, () => {
    					if_blocks[previous_block_index] = null;
    				});
    				check_outros();

    				if_block = if_blocks[current_block_type_index];
    				if (!if_block) {
    					if_block = if_blocks[current_block_type_index] = if_block_creators[current_block_type_index](ctx);
    					if_block.c();
    				}
    				transition_in(if_block, 1);
    				if_block.m(div, null);
    			}
    		},

    		i: function intro(local) {
    			if (current) return;
    			transition_in(if_block);
    			current = true;
    		},

    		o: function outro(local) {
    			transition_out(if_block);
    			current = false;
    		},

    		d: function destroy(detaching) {
    			if (detaching) {
    				detach_dev(div);
    			}

    			if_blocks[current_block_type_index].d();
    			dispose();
    		}
    	};
    	dispatch_dev("SvelteRegisterBlock", { block, id: create_fragment$1.name, type: "component", source: "", ctx });
    	return block;
    }

    function instance$1($$self, $$props, $$invalidate) {
    	

    	// let base_visible = false;
    	// const unsubscribe = baseContVisible.subscribe(value => {
    // console.log('sssssssss', value);
    		// base_visible = value;
    	// });
    	// const unsubscribe1 = leafletMap.subscribe(value => {
    // console.log('leafletMap', value);
    	// });
    	
        let { name = '', tab = 'filters' } = $$props;
    // console.log('mapID vv33333v', name); // .mapID

    	leafletMap.update(n => nsGmx.leafletMap);
    	gmxMap.update(n => nsGmx.gmxMap);

    	let toggleBase = () => {
    		baseContVisible.update(n => !n);
    	};

    	let sidebar_num = 1;
    	let sidebar_visible = true;
    	let toggleSidebar = (ev) => {
    // console.log('toggleSidebar', ev);
    		sidebar_visible = !sidebar_visible;
    		let classList = ev.target.classList,
    			className = 'rotate180';
    		if (classList.contains(className)) {
    			classList.remove(className);
    		} else {
    			classList.add(className);
    		}
    	};
    	let openSidebar = (nm) => {
    // console.log('op222enSidebar', sidebar_num, nm);
    		if (sidebar_num === nm) { nm = 0; }
    		sidebar_num = nm;
    	};

        onMount (() => {
    // console.log('mapIDnnnnnnnnnnnnn', name); // .mapID
    	});

    	const writable_props = ['name', 'tab'];
    	Object.keys($$props).forEach(key => {
    		if (!writable_props.includes(key) && !key.startsWith('$$')) console.warn(`<App> was created with unknown prop '${key}'`);
    	});

    	function filters_openSidebar_binding(value) {
    		openSidebar = value;
    		$$invalidate('openSidebar', openSidebar);
    	}

    	$$self.$set = $$props => {
    		if ('name' in $$props) $$invalidate('name', name = $$props.name);
    		if ('tab' in $$props) $$invalidate('tab', tab = $$props.tab);
    	};

    	$$self.$capture_state = () => {
    		return { name, tab, toggleBase, sidebar_num, sidebar_visible, toggleSidebar, openSidebar };
    	};

    	$$self.$inject_state = $$props => {
    		if ('name' in $$props) $$invalidate('name', name = $$props.name);
    		if ('tab' in $$props) $$invalidate('tab', tab = $$props.tab);
    		if ('toggleBase' in $$props) toggleBase = $$props.toggleBase;
    		if ('sidebar_num' in $$props) sidebar_num = $$props.sidebar_num;
    		if ('sidebar_visible' in $$props) sidebar_visible = $$props.sidebar_visible;
    		if ('toggleSidebar' in $$props) $$invalidate('toggleSidebar', toggleSidebar = $$props.toggleSidebar);
    		if ('openSidebar' in $$props) $$invalidate('openSidebar', openSidebar = $$props.openSidebar);
    	};

    	return {
    		name,
    		tab,
    		toggleSidebar,
    		openSidebar,
    		filters_openSidebar_binding
    	};
    }

    class App extends SvelteComponentDev {
    	constructor(options) {
    		super(options);
    		init(this, options, instance$1, create_fragment$1, safe_not_equal, ["name", "tab"]);
    		dispatch_dev("SvelteRegisterComponent", { component: this, tagName: "App", options, id: create_fragment$1.name });
    	}

    	get name() {
    		throw new Error("<App>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set name(value) {
    		throw new Error("<App>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get tab() {
    		throw new Error("<App>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set tab(value) {
    		throw new Error("<App>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}
    }

    exports.App = App;

    return exports;

}({}));
//# sourceMappingURL=domrf_1.0.js.map
