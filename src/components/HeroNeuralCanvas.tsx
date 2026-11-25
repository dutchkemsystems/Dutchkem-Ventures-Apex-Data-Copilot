import React, { useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";

const _dummy = new THREE.Object3D();
const _color = new THREE.Color();

function getWebGLCapabilities(): { supported: boolean; software: boolean } {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return { supported: false, software: true };
  }
  try {
    if (!window.WebGLRenderingContext) {
      return { supported: false, software: true };
    }
    const canvas = document.createElement("canvas");
    const gl = canvas.getContext("webgl2") || canvas.getContext("webgl");
    if (!gl) return { supported: false, software: true };
    const ext = gl.getExtension("WEBGL_debug_renderer_info");
    const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
    const gpu = String(gl.getParameter(param) || "");
    return {
      supported: true,
      software: /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu),
    };
  } catch {
    return { supported: false, software: true };
  }
}

const NODE_PALETTE = ["#2563EB", "#0EA5E9", "#10B981", "#F59E0B", "#4F46E5"];

function NeuralLatticeScene() {
  const groupRef = useRef<THREE.Group>(null);
  const nodesRef = useRef<THREE.InstancedMesh>(null);
  const { pointer } = useThree();

  const { nodePositions, lineGeometry, nodeCount } = useMemo(() => {
    const count = 96;
    const pts: THREE.Vector3[] = [];
    const goldenAngle = Math.PI * (3 - Math.sqrt(5));

    for (let i = 0; i < count; i++) {
      const y = 1 - (i / (count - 1)) * 2;
      const radiusAtY = Math.sqrt(Math.max(0, 1 - y * y));
      const theta = goldenAngle * i;
      const shell = 3.15 + (i % 3) * 0.65;
      pts.push(
        new THREE.Vector3(
          Math.cos(theta) * radiusAtY * shell,
          y * shell * 0.78,
          Math.sin(theta) * radiusAtY * shell
        )
      );
    }

    const segments: number[] = [];
    for (let i = 0; i < count; i++) {
      for (let j = i + 1; j < count; j++) {
        const d = pts[i].distanceTo(pts[j]);
        if (d < 1.85) {
          segments.push(pts[i].x, pts[i].y, pts[i].z);
          segments.push(pts[j].x, pts[j].y, pts[j].z);
        }
      }
    }

    const lineGeo = new THREE.BufferGeometry();
    lineGeo.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(segments, 3)
    );

    return { nodePositions: pts, lineGeometry: lineGeo, nodeCount: count };
  }, []);

  const nodeGeo = useMemo(() => new THREE.IcosahedronGeometry(0.085, 1), []);
  const nodeMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: "#FFFFFF",
        emissive: "#2563EB",
        emissiveIntensity: 0.22,
        metalness: 0.35,
        roughness: 0.18,
      }),
    []
  );

  const ringGeo = useMemo(() => new THREE.TorusGeometry(4.45, 0.024, 14, 128), []);
  const skyRingMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: "#0EA5E9",
        emissive: "#2563EB",
        emissiveIntensity: 0.25,
        metalness: 0.65,
        roughness: 0.2,
        transparent: true,
        opacity: 0.45,
      }),
    []
  );
  const emeraldRingMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: "#10B981",
        emissive: "#059669",
        emissiveIntensity: 0.22,
        metalness: 0.65,
        roughness: 0.2,
        transparent: true,
        opacity: 0.4,
      }),
    []
  );

  const lineMat = useMemo(
    () =>
      new THREE.LineBasicMaterial({
        color: "#3B82F6",
        transparent: true,
        opacity: 0.18,
      }),
    []
  );

  useEffect(() => {
    if (!nodesRef.current) return;
    for (let i = 0; i < nodeCount; i++) {
      _dummy.position.copy(nodePositions[i]);
      _dummy.scale.setScalar(i % 4 === 0 ? 1.55 : 0.92);
      _dummy.updateMatrix();
      nodesRef.current.setMatrixAt(i, _dummy.matrix);
      _color.set(NODE_PALETTE[i % NODE_PALETTE.length]);
      nodesRef.current.setColorAt(i, _color);
    }
    nodesRef.current.instanceMatrix.needsUpdate = true;
    if (nodesRef.current.instanceColor) {
      nodesRef.current.instanceColor.needsUpdate = true;
    }
    nodesRef.current.computeBoundingSphere();

    return () => {
      lineGeometry.dispose();
      nodeGeo.dispose();
      nodeMat.dispose();
      ringGeo.dispose();
      skyRingMat.dispose();
      emeraldRingMat.dispose();
      lineMat.dispose();
    };
  }, [
    emeraldRingMat,
    lineGeometry,
    lineMat,
    nodeCount,
    nodeGeo,
    nodeMat,
    nodePositions,
    ringGeo,
    skyRingMat,
  ]);

  useFrame((state, delta) => {
    const group = groupRef.current;
    if (!group) return;
    const clampedDelta = Math.min(delta, 0.05);
    const elapsed = state.clock.getElapsedTime();
    group.rotation.y += clampedDelta * 0.09;
    group.rotation.x = THREE.MathUtils.damp(
      group.rotation.x,
      pointer.y * 0.18 + Math.sin(elapsed * 0.28) * 0.06,
      3.5,
      clampedDelta
    );
    group.rotation.z = THREE.MathUtils.damp(
      group.rotation.z,
      -pointer.x * 0.12,
      3.5,
      clampedDelta
    );
  });

  return (
    <group ref={groupRef} position={[1.8, 0, -1.2]}>
      <lineSegments geometry={lineGeometry} material={lineMat} />
      <instancedMesh
        ref={nodesRef}
        args={[nodeGeo, nodeMat, nodeCount]}
        frustumCulled={false}
      />
      <mesh
        geometry={ringGeo}
        material={skyRingMat}
        rotation={[Math.PI / 2.6, 0.25, 0]}
      />
      <mesh
        geometry={ringGeo}
        material={emeraldRingMat}
        rotation={[-Math.PI / 3.1, -0.4, 0.2]}
        scale={0.82}
      />
    </group>
  );
}

class WebGLErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div
          className="absolute inset-0 bg-[radial-gradient(circle_at_75%_30%,rgba(14,165,233,0.16),rgba(16,185,129,0.1)_40%,rgba(245,158,11,0.08)_65%,#F8FAFF)]"
          aria-hidden="true"
        />
      );
    }
    return this.props.children;
  }
}

export function HeroNeuralCanvas() {
  const [glCaps, setGlCaps] = useState<{ supported: boolean; software: boolean }>({
    supported: false,
    software: true,
  });
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setGlCaps(getWebGLCapabilities());
    setMounted(true);
  }, []);

  if (!mounted || !glCaps.supported) {
    return (
      <div
        className="absolute inset-0 pointer-events-none bg-[radial-gradient(circle_at_75%_30%,rgba(14,165,233,0.16),rgba(16,185,129,0.1)_40%,rgba(245,158,11,0.08)_65%,#F8FAFF)]"
        aria-hidden="true"
      />
    );
  }

  return (
    <div className="absolute inset-0 pointer-events-none" aria-hidden="true">
      <WebGLErrorBoundary>
        <Canvas
          dpr={glCaps.software ? 1 : [1, 2]}
          camera={{ position: [0, 0.55, 8.2], fov: 46, near: 0.1, far: 100 }}
          gl={{
            antialias: !glCaps.software,
            powerPreference: "high-performance",
            alpha: true,
            toneMapping: THREE.ACESFilmicToneMapping,
            toneMappingExposure: 1.08,
          }}
        >
          <color attach="background" args={["#F8FAFF"]} />
          <fog attach="fog" args={["#F8FAFF", 7.5, 19]} />
          <ambientLight intensity={1.05} />
          <hemisphereLight args={["#FFFFFF", "#E0F2FE", 1.2]} />
          <directionalLight position={[6, 8, 5]} intensity={1.8} color="#FFFFFF" />
          <pointLight position={[-5, 3, 4]} intensity={1.1} color="#38BDF8" />
          <pointLight position={[5, -3, 3]} intensity={0.9} color="#34D399" />
          <NeuralLatticeScene />
        </Canvas>
      </WebGLErrorBoundary>
    </div>
  );
}
