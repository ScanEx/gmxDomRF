<script>
    import {onMount, setContext, getContext} from 'svelte';
	// import { leafletMap, gmxMap } from './stores.js';
	import Filters from './Filters/Filters.svelte';
	import Requests from './Requests.js';
	import './global.css';
	
	export let tab = 'filters';
	export let leafletMap;
	export let gmxMap;
	export let syncParams = {};

	let toggleBase = () => {
		baseContVisible.update(n => !n);
	};

	let sidebar_num = 1;
	let sidebar_visible = true;
	let toggleSidebar = (ev) => {
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
		if (sidebar_num === nm) { nm = 0; }
		sidebar_num = nm;
	};

	onMount(() => {
		Requests.setSyncParams(syncParams);
	});

</script>

<div class="domrf-plugin-container">
	<ul class="nav nav-tabs">
		<li class="nav-item">
			<a class="nav-link {tab === 'filters' ? 'active' : '-'}" href="#filters" on:click={toggleSidebar}>Фильтры</a>
		</li>
	</ul>

{#if tab === 'filters'}
	<Filters bind:gmxMap bind:leafletMap bind:openSidebar />
{/if}
</div>
