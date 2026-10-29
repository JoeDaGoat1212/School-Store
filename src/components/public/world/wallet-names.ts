/*
 * Display names for things you own, filled in by the dealership and realtor
 * catalogues (so the wallet doesn't need to import them).
 */
const cars = new Map<string, string>();
const houses = new Map<string, string>();
export const nameCar = (model: string, name: string) => cars.set(model, name);
export const nameHouse = (id: string, name: string) => houses.set(id, name);
export const carName = (model: string) => cars.get(model) ?? model;
export const houseName = (id: string) => houses.get(id) ?? id;
