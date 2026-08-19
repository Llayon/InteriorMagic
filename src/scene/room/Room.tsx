import { useEditorStore } from '@/editor/state/store';
import { isDebugEnabled } from '@/shared/debug';
const floors:Record<string,string>={oak:'#b89468',walnut:'#73513e',concrete:'#a8a49c'};
const walls:Record<string,string>={linen:'#e8e0d1',mist:'#c9d5d4',clay:'#d8b5a2'};
export function Room(){const room=useEditorStore(s=>s.project.room),finishes=useEditorStore(s=>s.project.finishes);return <group>
  <mesh rotation-x={-Math.PI/2}><planeGeometry args={[room.width,room.depth]}/><meshStandardMaterial color={floors[finishes.floorMaterialId]??floors.oak} roughness={.68} metalness={0}/></mesh>
  <mesh position={[0,room.height/2,-room.depth/2]}><planeGeometry args={[room.width,room.height]}/><meshStandardMaterial color={walls[finishes.wallMaterialId]??walls.linen} roughness={.94} metalness={0}/></mesh>
  <mesh position={[-room.width/2,room.height/2,0]} rotation-y={Math.PI/2}><planeGeometry args={[room.depth,room.height]}/><meshStandardMaterial color={walls[finishes.wallMaterialId]??walls.linen} roughness={.94} metalness={0}/></mesh>
  <mesh position={[0,.055,-room.depth/2+.018]}><boxGeometry args={[room.width,.11,.036]}/><meshStandardMaterial color="#f3efe7" roughness={.82}/></mesh>
  <mesh position={[-room.width/2+.018,.055,0]}><boxGeometry args={[.036,.11,room.depth]}/><meshStandardMaterial color="#f3efe7" roughness={.82}/></mesh>
  {isDebugEnabled && <gridHelper args={[10,200,'#8d8377','#8d8377']} position={[0,.003,0]} material-transparent material-opacity={.035}/>}
</group>}
