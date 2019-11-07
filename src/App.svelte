<script>
    import {onMount, setContext, getContext} from 'svelte';
	
	import { leafletMap, gmxMap } from './stores.js';

    // import Map from './Map/Map.svelte';
    // import LayersTree from './Controls/LayersTree/LayersTree.svelte';
    // import Zoom from './Controls/Zoom/Zoom.svelte';
    // import Base from './Controls/Base/Base.svelte';

    // import Layers from './Layers/Layers.svelte';
    import Filters from './Filters/Filters.svelte';

	// let base_visible = false;
	// const unsubscribe = baseContVisible.subscribe(value => {
// console.log('sssssssss', value);
		// base_visible = value;
	// });
	// const unsubscribe1 = leafletMap.subscribe(value => {
// console.log('leafletMap', value);
	// });
	
    export let name = '';
    export let tab = 'filters';
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

</script>

<div class="domrf-plugin-container">
	<ul class="nav nav-tabs">
		<li class="nav-item">
			<a class="nav-link {tab === 'filters' ? 'active' : '-'}" href="#tab2" data-toggle="tab" on:click={toggleSidebar}>Фильтры</a>
		</li>
	</ul>

{#if tab === 'filters'}
	<Filters bind:openSidebar />
{:else if tab === 'kvart'}
{:else}
{/if}
</div>
