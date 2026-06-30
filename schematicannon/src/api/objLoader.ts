import { Mesh, Quad, Vector, Vertex } from 'deepslate';

export interface ObjMeshPart {
  mesh: Mesh;
  texture: string; // material name
}

export function parseObj (objData: string): ObjMeshPart[] {
  const lines = objData.split('\n');
  const positions: Vector[] = [];
  const uvs: [number, number][] = [];
  const normals: Vector[] = [];

  // Preliminary pass to detect scale, ignoring Bounding objects
  let maxCoord = 0;
  let isCheckingScaleForObject = true;
  for (const line of lines) {
    const parts = line.trim().split(/\s+/);
    if (parts.length === 0) {
      continue;
    }

    if (parts[0] === 'o' || parts[0] === 'g') {
      const name = parts[1] || '';
      isCheckingScaleForObject = !name.startsWith('Bounding');
    } else if (parts[0] === 'v' && isCheckingScaleForObject) {
      const x = Math.abs(parseFloat(parts[1]!));
      const y = Math.abs(parseFloat(parts[2]!));
      const z = Math.abs(parseFloat(parts[3]!));
      maxCoord = Math.max(maxCoord, x, y, z);
    }
  }
  const scale = maxCoord > 0 && maxCoord <= 4.0 ? 16.0 : 1.0;

  const parts: ObjMeshPart[] = [];
  let currentMaterial = 'particle'; // Default
  let currentMesh = new Mesh();
  let ignoreCurrentObject = false;

  const flushPart = () => {
    if (!ignoreCurrentObject && !currentMesh.isEmpty()) {
      parts.push({ mesh: currentMesh, texture: currentMaterial });
      currentMesh = new Mesh();
    }
  };

  for (const line of lines) {
    const parts = line.trim().split(/\s+/);
    if (parts.length === 0) {
      continue;
    }
    const type = parts[0];

    if (type === 'o' || type === 'g') {
      flushPart();
      // Ignore bounding boxes (Create mod convention)
      const name = parts[1] || '';
      if (name.startsWith('Bounding')) {
        ignoreCurrentObject = true;
      } else {
        ignoreCurrentObject = false;
      }
    } else if (type === 'v') {
      positions.push(new Vector(
        parseFloat(parts[1]!) * scale,
        parseFloat(parts[2]!) * scale,
        parseFloat(parts[3]!) * scale
      ));
    } else if (type === 'vt') {
      // OBJ UVs: (0,0) bottom-left.
      // Deepslate/Minecraft: (0,0) top-left relative to texture.
      // We need V = 1.0 - V_obj
      uvs.push([parseFloat(parts[1]!), 1.0 - parseFloat(parts[2]!)]);
    } else if (type === 'vn') {
      normals.push(new Vector(parseFloat(parts[1]!), parseFloat(parts[2]!), parseFloat(parts[3]!)));
    } else if (type === 'usemtl') {
      flushPart();
      currentMaterial = parts[1]!;
    } else if (type === 'f' && !ignoreCurrentObject) {
      const vertices: Vertex[] = [];
      for (let i = 1; i < parts.length; i++) {
        const indices = parts[i]!.split('/');
        const vIdx = parseInt(indices[0]!) - 1;
        const vtIdx = indices[1] ? parseInt(indices[1]) - 1 : undefined;
        const vnIdx = indices[2] ? parseInt(indices[2]) - 1 : undefined;

        const pos = positions[vIdx];
        const uv = vtIdx !== undefined ? uvs[vtIdx] : [0, 0];
        const norm = vnIdx !== undefined ? normals[vnIdx] : undefined;

        // Deepslate Vertex: pos, color, texture, textureLimit, normal, blockPos
        vertices.push(new Vertex(pos!, [1, 1, 1], [uv![0]!, uv![1]!], [0, 0, 1, 1], norm, undefined));
      }

      // Triangulate fan
      for (let i = 2; i < vertices.length; i++) {
        currentMesh.quads.push(new Quad(vertices[0]!, vertices[i - 1]!, vertices[i]!, vertices[i]!));
      }
    }
  }
  flushPart();
  return parts;
}
