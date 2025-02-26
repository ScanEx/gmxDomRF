import { writable } from 'svelte/store';

// export const Store = {
	// leafletMap: writable(0),
	// baseContVisible: writable(0),
	// mapID: writable(0),
	// mapTree: writable(0)
// };
export const leafletMap = writable(0);
export const gmxMap = writable(0);

export const mapLayers = writable(0);
export const baseContVisible = writable(0);
export const mapID = writable(0);
export const mapTree = writable(0);
export const worker = writable(0);
export const kvItems = writable(0);
export const delItems = writable(0);
export const reportsCount = writable(0);