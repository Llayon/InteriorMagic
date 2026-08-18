import { useEditorStore } from '@/editor/state/store';
const floors:Record<string,string>={oak:'#b89468',walnut:'#73513e',concrete:'#a8a49c'};
const walls:Record<string,string>={linen:'#e8e0d1',mist:'#c9d5d4',clay:'#d8b5a2'};
export function Room(){const room=useEditorStore(s=>s.project.room),finishes=useEditorStore(s=>s.project.finishes);return <group>
  <mesh rotation-x={-Math.PI/2} receiveShadow><planeGeometry args={[room.width,room.depth]}/><meshStandardMaterial color={floors[finishes.floorMaterialId]??floors.oak} roughness={.85}/></mesh>
  <mesh position={[0,room.height/2,-room.depth/2]}><planeGeometry args={[room.width,room.height]}/><meshStandardMaterial color={walls[finishes.wallMaterialId]??walls.linen} roughness={.92}/></mesh>
  <mesh position={[-room.width/2,room.height/2,0]} rotation-y={Math.PI/2}><planeGeometry args={[room.depth,room.height]}/><meshStandardMaterial color={walls[finishes.wallMaterialId]??walls.linen} roughness={.92}/></mesh>
  <gridHelper args={[10,200,'#8d8377','#8d8377']} position={[0,.003,0]} material-transparent material-opacity={.035}/>
</group>}
