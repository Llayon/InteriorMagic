/** Worker-side re-export of the shared strict RoomProject document boundary.
 *  Import path follows the planning-intent worker convention for reaching
 *  repository-shared src/ modules. */
export {
  MAX_ASSET_ID_LENGTH,
  MAX_INSTANCE_ID_LENGTH,
  MAX_MATERIAL_ID_LENGTH,
  MAX_PROJECT_OBJECTS,
  MAX_ROOM_HEIGHT,
  MAX_ROOM_WIDTH_DEPTH,
  MAX_VARIANT_ID_LENGTH,
  ProjectDocumentError,
  hashRoomProjectDocument,
  parseRoomProjectDocument,
  serializeRoomProjectCanonical,
} from '../../../src/editor/serialization/projectDocument';
