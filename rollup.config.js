import babel from 'rollup-plugin-babel';
import svelte from 'rollup-plugin-svelte';
import resolve from 'rollup-plugin-node-resolve';
import css from 'rollup-plugin-css-porter';
import commonjs from 'rollup-plugin-commonjs';
import pkg from './package.json';

export default {
	input: 'src/App.svelte',
	output: {
		sourcemap: true,
		format: 'cjs',
		file: pkg.main,
	},
	plugins: [
		svelte(),
		resolve(),            
		commonjs(),
		css({dest: 'dist/domrf_1.0.css', minified: false}),
		babel({include: ['src/**', 'node_modules/svelte/shared.js']}),
	]
};
