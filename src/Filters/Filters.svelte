<script>
   import {onMount, beforeUpdate, setContext, getContext} from 'svelte';
   
	import * as Config from '../Config.js';
	import Requests from '../Requests.js';
	import * as Store from '../stores.js';
	import Utils from '../Utils.js';
	// import SelectInput from './SelectInput.svelte';

const stateStorage = Utils.getState();
let changedParams = {test: 23};

let exportButton = null;
let content = null;

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
let gmxMap = null; Store.gmxMap.subscribe(value => {
	gmxMap = value;
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
		console.log('gmxMap', it);
	});
	// */
});

let currLayer = null;
const changeLayer = (ev) => {
	let id = ev ? ev.target.selectedOptions[0].value : null,
		_gmx = gmxMap.layersByID[id];
	if (id) {
		getColumnStat(id).then((arr) => {
			currLayer = filterLayers[id];
			arr.forEach((it) => {
				currLayer.filters[it.field].datalist = it.datalist;
			});
			console.log('________', currLayer, arr)
			// arr.
		});
	} else {
		currLayer = null;
		
	}
console.log('changeLayer', id, filterLayers[id], gmxMap.layersByID[id]);
};

let drawingButton = null;
let currDrawingObj = null;
let currDrawingObjArea = null;
const privaz = (ev, dObj) => {
console.log('privaz', ev, dObj);
	currDrawingObj = dObj;
	currDrawingObjArea = dObj.getSummary();
	// currDrawingObjArea = L.gmxUtil.geoJSONGetArea(dObj.toGeoJSON());
	
	drawingButton.checked = true;
};

let map = null; Store.leafletMap.subscribe(value => {
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
		currDrawingObj = currDrawingObjArea = null;
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
		str = '',
		arr = [];
	console.log('createExport', exportButton, content, arr.join(' , ') );
};

const createFilterLayer = (ev) => {
	let id = currLayer.id,
		layer = gmxMap.layersByID[id],
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
		w += ' AND intersects([geomixergeojson], GeometryFromGeoJson(\'' + JSON.stringify(currDrawingObj.toGeoJSON()) + '\', 4326))'
	}
	pars.Sql = 'select [geomixergeojson] as gmx_geometry, ' + currLayer.attr + ', "gmx_id" as "gmx_id" from [' + id + '] ' + w;

	Requests.createFilterLayer(pars).then((res) => {
console.log('afterAll 111 ________', res);
		let LayerID = res.content.properties.LayerID,
			it = gmxMap.layersByID[LayerID];
							// if (it && opt.source) {
		it.setStyles(layer.getStyles());
							// }
	});
//	console.log('createFilterLayer', exportButton, content, arr.join(' , ') );
};
</script>

<div class="sidebar-opened" bind:this={content}>
	<div class="row">
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
	{#each Object.keys(currLayer.filters) as field}
	<div class="row">
		<div class="title">{currLayer.filters[field].title}</div>
		<div class="input">
			<input type="text" name="{field}" list="{field}" />
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

	<div class="row">
		<div class="checkbox">
		   <input type="checkbox" name="checkboxG4" on:change="{createDrawing}" bind:this={drawingButton} id="checkboxG4" class="css-checkbox2" title="Нарисовать или выбрать объект по правой кнопке на вершине"/><label for="checkboxG4" class="css-label2 radGroup1">Поиск по пересечению с объектом</label>
			{#if currDrawingObj}
			<span class="currDrawingObjArea">{currDrawingObjArea}</span>
			{/if}
		</div>
	</div>
{/if}
	
	<div class="bottom" disabled={currLayer ? false : true} bind:this={exportButton}>
		<button class="button" on:click="{createFilterLayer}">Создать слой по фильтру</button>
		<button class="button" on:click="{createExport}">Экспорт в Excel</button>
	</div>

</div>
