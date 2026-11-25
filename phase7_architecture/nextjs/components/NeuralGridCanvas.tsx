"use client";

import React, { useEffect, useMemo, useRef } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";

const _dummy = new THREE.Object3D();
const _color = new THREE.Color();

function NeuralLatticeMesh() {
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
      const shell = 3.2 + (i % 3) * 0.65;
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

  const nodeGeo = useMemo(() => new THREE.IcosahedronGeometry(0.065, 1), []);
  const nodeMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: "#F5C451",
        emissive: "#B47B14",
        emissiveIntensity: 0.7,
        metalness: 0.85,
        roughness: 0.2,
      }),
    []
  );

  const ringGeo = useMemo(() => new THREE.TorusGeometry(4.45, 0.014, 12, 128), []);
  const ringMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: "#D97706",
        emissive: "#92400E",
        emissiveIntensity: 0.2,
        metalness: 0.85,
        roughness: 0.24,
        transparent: true,
        opacity: 0.52,
      }),
    []
  );

  const lineMat = useMemo(
    () =>
      new THREE.LineBasicMaterial({
        color: "#1E293B",
        transparent: true,
        opacity: 0.2,
      }),
    []
  );

  useEffect(() => {
    if (!nodesRef.current) return;
    for (let i = 0; i < nodeCount; i++) {
      _dummy.position.copy(nodePositions[i]);
      _dummy.scale.setScalar(i % 5 === 0 ? 1.48 : 0.88);
      _dummy.updateMatrix();
      nodesRef.current.setMatrixAt(i, _dummy.matrix);
      _color.set(i % 4 === 0 ? "#D97706" : "#0F172A");
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
      ringMat.dispose();
      lineMat.dispose();
    };
  }, [lineGeometry, lineMat, nodeCount, nodeGeo, nodeMat, nodePositions, ringGeo, ringMat]);

  useFrame((state, delta) => {
    const group = groupRef.current;
    if (!group) return;
    const elapsed = state.clock.getElapsedTime();
    group.rotation.y += delta * 0.09;
    group.rotation.x = THREE.MathUtils.damp(
      group.rotation.x,
      pointer.y * 0.22 + Math.sin(elapsed * 0.25) * 0.06,
      3.5,
      delta
    );
    group.rotation.z = THREE.MathUtils.damp(
      group.rotation.z,
      -pointer.x * 0.14,
      3.5,
      delta
    );
  });

  return (
    <group ref={groupRef} position={[1.4, 0, -1.2]}>
      <lineSegments geometry={lineGeometry} material={lineMat} />
      <instancedMesh
        ref={nodesRef}
        args={[nodeGeo, nodeMat, nodeCount]}
        frustumCulled={false}
      />
      <mesh geometry={ringGeo} material={ringMat} rotation={[Math.PI / 2.6, 0.25, 0]} />
      <mesh geometry={ringGeo} material={ringMat} rotation={[-Math.PI / 3.1, -0.4, 0.2]} scale={0.82} />
    </group>
  );
}

export function NeuralGridCanvas() {
  return (
    <div className="absolute inset-0 pointer-events-none">
      <Canvas
        dpr={[1, 2]}
        camera={{ position: [0, 0.6, 8.2], fov: 46, near: 0.1, far: 100 }}
        gl={{ antialias: true, powerPreference: "high-performance", alpha: true }}
      >
        <color attach="background" args={["#F8FAFC"]} />
        <fog attach="fog" args={["#F8FAFC", 7.5, 19]} />
        <ambientLight intensity={0.85} />
        <hemisphereLight args={["#FFFFFF", "#CBD5E1", 1.1]} />
        <directionalLight position={[6, 8, 5]} intensity={1.9} color="#FFFBEB" />
        <pointLight position={[-5, -3, 3]} intensity={0.9} color="#F59E0B" />
        <NeuralLatticeMesh />
      </Canvas>
    </div>
  );
}
