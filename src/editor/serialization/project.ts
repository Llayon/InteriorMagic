import { createDefaultProject, type RoomProject } from '@/editor/model/types';
export const serializeProject=(project:RoomProject)=>JSON.stringify(project);
export const deserializeProject=(value:string):RoomProject=>{const data:unknown=JSON.parse(value);if(!data||typeof data!=='object'||(data as {version?:number}).version!==1)throw new Error('Unsupported project data');const p=data as RoomProject;if(!p.room||!p.finishes||!Array.isArray(p.objects))throw new Error('Invalid project data');return structuredClone(p)};
export interface ProjectStorage { load():RoomProject|null; save(project:RoomProject):void; clear():void }
export class LocalProjectStorage implements ProjectStorage { constructor(private key='interior-magic-project-v1'){} load(){try{const raw=localStorage.getItem(this.key);return raw?deserializeProject(raw):null}catch{return null}} save(p:RoomProject){localStorage.setItem(this.key,serializeProject(p))} clear(){localStorage.removeItem(this.key)} }
export const storage=new LocalProjectStorage();
export const loadInitialProject=()=>storage.load()??createDefaultProject();
