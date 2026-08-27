import { createDefaultProject, type RoomProject } from '@/editor/model/types';
import { ProjectDocumentError, parseRoomProjectDocument } from './projectDocument';

/** Local wire format stays plain v1 JSON; integrity is enforced by the shared
 *  strict document boundary. Previously tolerated malformed v1 documents now
 *  fail closed here and callers fall back to the default project. */
export const serializeProject=(project:RoomProject)=>JSON.stringify(project);
export const deserializeProject=(value:string):RoomProject=>{const data:unknown=JSON.parse(value);try{return structuredClone(parseRoomProjectDocument(data))}catch(cause){if(cause instanceof ProjectDocumentError)throw new Error('Invalid project data');throw cause}};
export interface ProjectStorage { load():RoomProject|null; save(project:RoomProject):void; clear():void }
type StorageLike=Pick<Storage,'getItem'|'setItem'|'removeItem'>;
export class LocalProjectStorage implements ProjectStorage { constructor(private key='interior-magic-project-v1', private backend?:StorageLike){} private get store():StorageLike{return this.backend??(globalThis.localStorage as StorageLike)} load(){try{const raw=this.store.getItem(this.key);return raw?deserializeProject(raw):null}catch{return null}} save(p:RoomProject){this.store.setItem(this.key,serializeProject(p))} clear(){this.store.removeItem(this.key)} }
export const storage=new LocalProjectStorage();
export const loadInitialProject=()=>storage.load()??createDefaultProject();
