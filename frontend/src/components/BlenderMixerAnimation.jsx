const BLADE_ANGLES = [0, 90, 180, 270];

function Blade({ angle }) {
  return (
    <div
      className="blender-blade"
      style={{ transform: `rotate(${angle}deg)` }}
    />
  );
}

/**
 * Pure CSS spinning blender — metal blades + liquid vortex (no SVG/emoji graphics).
 */
function BlenderMixerAnimation({ active = true }) {
  if (!active) return null;

  return (
    <div className="blender-mix-stage" aria-label="Blender mixing" role="img">
      <div className="blender-mix-liquid blender-mix-liquid--fast" />
      <div className="blender-surface-ring" />
      <div className="blender-bubble blender-bubble--1" />
      <div className="blender-bubble blender-bubble--2" />
      <div className="blender-bubble blender-bubble--3" />
      <div className="blender-bubble blender-bubble--4" />
      <div className="blender-impeller">
        <div className="blender-impeller-ghost" aria-hidden>
          {BLADE_ANGLES.map((angle) => (
            <Blade key={`ghost-${angle}`} angle={angle} />
          ))}
        </div>
        {BLADE_ANGLES.map((angle) => (
          <Blade key={angle} angle={angle} />
        ))}
        <div className="blender-impeller-hub" />
      </div>
    </div>
  );
}

export default BlenderMixerAnimation;
