<script>
import {onMount, beforeUpdate, setContext, getContext} from 'svelte';
import * as Config from '../Config.js';
import Requests from '../Requests.js';
// import * as Store from '../stores.js';
// import Utils from '../Utils.js';

// const stateStorage = Utils.getState();
let changedParams = {test: 23};

let error = null;
let waitingIcon = null;
let content = null;
export let leafletMap;
export let gmxMap;
export let syncParams = {};

let filterLayers = {};
const getColumnStat = (id) => {
	let layer = gmxMap.layersByID[id],
		_gmx = layer._gmx,
		props = layer.getGmxProperties(),
		meta = props.MetaProperties,
		out = {filters: []},
		promiseArr = [];

	for (var k in meta) {
		if (k !== 'filter') {
			if (k in _gmx.tileAttributeIndexes) {
				// let f = {field: k, title: meta[k].Value};
				// out.filters.push(f);
					promiseArr.push(Requests.getColumnStat({id: id, column: k}).then((json) => {
						if (json.res.ErrorInfo) {
							console.warn(json);
							return {};
						}
						let res = json.res.Result;
						if (res && res.unique) {
							//f.datalist = res.unique;
							return {field: json.queue.params.column, datalist: res.unique};
						}
						return null;
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
gmxMap.layers.forEach((it) => {
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
		filterLayers[id] = out;
	}
	// console.log('gmxMap', it);
});

let currLayer = null;
const changeLayer = (ev) => {
	let id = ev ? ev.target.selectedOptions[0].value : null,
		_gmx = gmxMap.layersByID[id];

	currLayer = null;
	waitingIcon.classList.remove('hidden');
	if (id) {
		getColumnStat(id).then((arr) => {
			currLayer = filterLayers[id];
			error = '';
			arr.forEach((it) => {
				if (it.field) {
					currLayer.filters[it.field].datalist = it.datalist;
				} else {
					error = 'Ошибка';
				}
			});
			setHidden(error);
			// waitingIcon.classList.add('hidden');
			// console.log('________', currLayer, arr)
		});
	}
	// console.log('changeLayer', id, filterLayers[id], gmxMap.layersByID[id]);
};

let drawingButton = null;
let currDrawingObj = null;
let currDrawingObjArea = null;
const privaz = (ev, dObj) => {
	currDrawingObj = dObj || ev.object;
	if (currDrawingObj._map) {
		currDrawingObjArea = currDrawingObj.getSummary();
		clearData();
		drawingButton.checked = true;
		error = '';
	} else {
		currDrawingObj = currDrawingObjArea = null;
	}
};

let map = leafletMap;
map.gmxDrawing.contextmenu.insertItem({callback: privaz, text: 'Привязать к фильтру'}, 0, 'points');

let drawingChecked = false;
const createDrawing = (ev) => {
	drawingChecked = ev.target.checked;
	L.DomEvent.stopPropagation(ev);
	let cont = map.getContainer(),
		button = ev.target.parentNode;

	error = '';
	if (drawingChecked) {
		//map.gmxDrawing.getFeatures();
		cont.style.cursor = 'pointer';
		
		let drawingControl = map.gmxControlsManager.get('drawing'),
			pIcon = drawingControl.getIconById('Polygon');
		drawingControl.setActiveIcon(pIcon, true);
		map.gmxDrawing.on('drawstop', privaz, this);
		// map.gmxDrawing.on('drawstop', (ev) => {
			// privaz(null, ev.object);
		// }, this);
		map.gmxDrawing.bringToFront();
	} else {
		currDrawingObj = currDrawingObjArea = null;
		cont.style.cursor = '';
		button.classList.remove('drawState');
		map.gmxDrawing.off('drawstop', privaz, this);
		map.gmxDrawing.create();
	}
};

const setHidden = (err) => {
// console.log('setHidden', ev );
	error = typeof(err) === 'string' ? err : '';
	waitingIcon.classList.add('hidden');
};

let filteredLayerID = '';
const clearData = () => {
	filteredLayerID = '';
};
let iframe = null;
const createExport = (ev) => {
	// waitingIcon.classList.remove('hidden');
	Requests.downloadLayer(ev.target.parentNode, filteredLayerID);
};

const createFilterLayer = (ev) => {
	if (drawingChecked && !currDrawingObjArea) {
		error = 'Необходимо нарисовать контур';
		let dc = leafletMap.gmxControlsManager.get('drawing'),
			ac = leafletMap.gmxControlsManager.get(dc.activeIcon || 'Polygon');
		ac.setActive(false);
		dc.setActiveIcon('', false);
		// let cont = map.getContainer(),
			// button = ev.target.parentNode,
			// drawingControl = map.gmxControlsManager.get('drawing'),
			// pIcon = drawingControl.getIconById('Polygon');
		// drawingControl.setActiveIcon(pIcon, false);
		// currDrawingObj = currDrawingObjArea = null;
		// cont.style.cursor = '';
		// button.classList.remove('drawState');
		// map.gmxDrawing.off('drawstop', privaz, this);
		// map.gmxDrawing.create();
		return;
	}
	let id = currLayer.id,
		layer = gmxMap.layersByID[id],
		props = layer.getGmxProperties(),
		nodes = content.getElementsByTagName('input'),
		pars = {SourceType: 'Sql', srs: 3857},
		inn = '',
		arr = [];

	waitingIcon.classList.remove('hidden');
	for (let i = 0, len = nodes.length; i < len; i++) {
		let node = nodes[i],
			name = node.name,
			val = node.value;
		if (val && node !== drawingButton) {
			arr.push('"' + node.name + '" = \'' + val + '\'');
			pars.Title = 'Объекты недвижимости собственника с ИНН "' + val + '" по слою "' + props.title + '"';
		}
	}
	// pars.Title = 'Фильтр ' + arr.join(', ') + ' по слою "' + props.title + '"';
	pars.styles = props.styles;
	pars.Description = props.description || '';
	pars.Copyright = props.Copyright || '';

	let w = '',
		alen = arr.length;
	if (currDrawingObj || alen) {
		w = 'WHERE ';
		if (currDrawingObj) {
			w += '"S_FIN" = \'FS\'';
			w += ' AND intersects([geomixergeojson], GeometryFromGeoJson(\'' + JSON.stringify(currDrawingObj.toGeoJSON()) + '\', 4326))'
			pars.Title = 'Федеральные объекты недвижимости в пределах контура по слою "' + props.title + '"';
		} else if (alen) {
			w += '(' + arr.join(') AND (') + ')';
		}
	}
	pars.Sql = 'select [geomixergeojson] as gmx_geometry, ' + currLayer.attr + ', "gmx_id" as "gmx_id" from [' + id + '] ' + w;

	Requests.createFilterLayer(pars).then((res) => {
		if (res.error) {
			setHidden(res.error);
		} else {
			setHidden('Слой создан');
			filteredLayerID = res.content.properties.LayerID;
		}
	});
	//	console.log('createFilterLayer', exportButton, content, arr.join(' , ') );

	onMount(() => {
		Requests.setSyncParams(syncParams);
	});
};
</script>
<svelte:window on:focus={setHidden} />
<div class="sidebar-opened" bind:this={content}>
	<div class="row hidden" bind:this={waitingIcon}>
		<div class="title">Выбор слоя</div>
		<div class="input">
			<select on:change={changeLayer}>
				<option value="" />
				{#each Object.keys(filterLayers) as k}
				<option value="{filterLayers[k].id}">{filterLayers[k].title}</option>
				{/each}
			</select>
		</div>
	</div>

	{#if currLayer}
		{#if !drawingChecked}
			{#each Object.keys(currLayer.filters) as field}
			<div class="row">
				<div class="title">{currLayer.filters[field].title}</div>
				<div class="input">
					<input type="text" name="{field}" list="{field}" on:change="{clearData}" />
				{#if currLayer.filters[field].datalist}
					<datalist id="{field}">
						{#each currLayer.filters[field].datalist as pt}
						<option value="{pt.value}" />
						{/each}
					</datalist>
				{/if}
				</div>
			</div>
			{/each}
		{/if}
		<div class="row">
			<div class="checkbox">
			<input type="checkbox" name="checkboxG4" on:change="{createDrawing}" bind:this={drawingButton} id="checkboxG4" class="css-checkbox2" title="Нарисовать или выбрать объект по правой кнопке на вершине"/><label for="checkboxG4" class="css-label2 radGroup1">Поиск федеральных объектов недвижимости по пересечению с контуром (создайте контур на Геопортале)</label>
				{#if currDrawingObj}
				<span class="currDrawingObjArea">{currDrawingObjArea}</span>
				{/if}
			</div>
		</div>
	{/if}

	<div class="bottom {currLayer ? '' : 'hidden'}">
		<button class="button" on:click="{createFilterLayer}">Создать слой по фильтру</button>
		<a href='load' download='features.geojson' target='download' onload="{setHidden}" class="exportHref {filteredLayerID ? '' : 'hidden'}">
			<iframe name="download" title="" class="hidden" bind:this={iframe} on:focus={clearData} />
			<button class="button" on:click="{createExport}">Экспорт в Excel</button>
		</a>
	</div>

{#if error}
	<div class="row error">
		<span class="txt">{error}</span>
	</div>
{/if}

</div>
