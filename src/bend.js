import * as THREE from 'three';

// 世界彎曲（Curved World）：只在頂點著色器把前方物件依距離平方往左右/上下偏移
// 遊戲邏輯仍是直線，畫面上呈現彎道與起伏（與原作相同手法）
// uBend.x = 左右彎曲量, uBend.y = 上下起伏量, uBend.z = 彎曲起點（玩家世界 z）

export const BEND = { value: new THREE.Vector3(0, 0, 0) };

export const BEND_GLSL = /* glsl */`
  vec4 bendApply(vec4 w) {
    float bd = max(0.0, uBend.z - w.z);
    w.x += uBend.x * bd * bd;
    w.y += uBend.y * bd * bd;
    return w;
  }
`;

let installed = false;

export function installBend() {
  if (installed) return;
  installed = true;
  // 全域 uniform 宣告（common 會被所有內建著色器引入）
  THREE.ShaderChunk.common = THREE.ShaderChunk.common + '\nuniform vec3 uBend;\n' + BEND_GLSL;
  THREE.ShaderChunk.project_vertex = THREE.ShaderChunk.project_vertex.replace(
    'mvPosition = modelViewMatrix * mvPosition;',
    'mvPosition = viewMatrix * bendApply( modelMatrix * mvPosition );',
  );
  // 所有內建材質自動掛上共用 uniform
  THREE.Material.prototype.onBeforeCompile = function (shader) {
    shader.uniforms.uBend = BEND;
  };
}

// 關閉視錐裁切（彎曲後的物件可能超出原本包圍球）
export function noCull(obj) {
  obj.traverse((o) => { o.frustumCulled = false; });
  return obj;
}
