export type GardenView = {
  earned: number;
  kinds: string[];
  decorations: { slot: number; itemId: string }[];
};

export function gardenStage(earned: number) {
  return earned >= 75
    ? "Ogród opowieści"
    : earned >= 40
      ? "Zielona przystań"
      : earned >= 15
        ? "Pierwsze pędy"
        : "Podwórko możliwości";
}

export function Ornament({ id, x, y }: { id: string; x: number; y: number }) {
  if (id === "tree")
    return (
      <g transform={`translate(${x} ${y})`} className="ig-sprout-in">
        <ellipse cy="13" rx="29" ry="12" fill="#426448" opacity=".15" />
        <path
          d="M0 5v-50"
          stroke="#73533e"
          strokeWidth="10"
          strokeLinecap="round"
        />
        <path d="M0-27-17-41M0-22l17-21" stroke="#73533e" strokeWidth="5" />
        <ellipse cy="-62" rx="35" ry="37" fill="#508957" />
        <ellipse cx="-12" cy="-70" rx="22" ry="26" fill="#79ac69" />
        <circle cx="16" cy="-65" r="5" fill="#f2bb5e" />
        <circle cx="-18" cy="-49" r="4" fill="#f2bb5e" />
      </g>
    );
  if (id === "pond")
    return (
      <g transform={`translate(${x} ${y})`} className="ig-sprout-in">
        <ellipse rx="42" ry="24" fill="#c7c7a1" />
        <ellipse cy="-2" rx="35" ry="18" fill="#80b8bb" />
        <path
          d="M-23-3h16M3 7h18M6-11h14"
          stroke="#eaf2dc"
          strokeWidth="3"
          strokeLinecap="round"
        />
        <ellipse cx="-14" cy="6" rx="9" ry="4" fill="#679066" />
        <circle cx="-15" cy="3" r="4" fill="#f5bcad" />
      </g>
    );
  if (id === "lantern")
    return (
      <g transform={`translate(${x} ${y})`} className="ig-sprout-in">
        <ellipse cy="10" rx="25" ry="10" fill="#e2d39c" />
        <path
          d="M0 8v-61h18"
          fill="none"
          stroke="#496759"
          strokeWidth="6"
          strokeLinecap="round"
        />
        <rect
          x="8"
          y="-63"
          width="23"
          height="30"
          rx="5"
          fill="#f8ce71"
          stroke="#6a7853"
          strokeWidth="3"
        />
        <path d="M15-57v17" stroke="#fff4d8" strokeWidth="3" />
        <circle
          className="ig-light-glow"
          cx="20"
          cy="-48"
          r="24"
          fill="#f7d577"
          opacity=".18"
        />
      </g>
    );
  return (
    <g transform={`translate(${x} ${y})`} className="ig-sprout-in">
      <ellipse rx="34" ry="16" fill="#80aa66" />
      {[-19, 0, 18].map((offset, index) => (
        <g
          key={offset}
          transform={`translate(${offset} ${index === 1 ? -8 : 0})`}
        >
          <path d="M0 0v-19" stroke="#3d7550" strokeWidth="3" />
          <path d="M0-7c-15-15-14 3 0 3" fill="#487b4d" />
          {[0, 72, 144, 216, 288].map((angle) => (
            <ellipse
              key={angle}
              cy="-26"
              rx="5"
              ry="8"
              fill={index === 1 ? "#f8ce71" : "#e7967a"}
              transform={`rotate(${angle} 0 -20)`}
            />
          ))}
          <circle cy="-20" r="5" fill="#fff3cf" />
        </g>
      ))}
    </g>
  );
}

export default function GardenPicture({
  progress,
  selectedSlot = -1,
  label,
}: {
  progress: GardenView;
  selectedSlot?: number;
  label?: string;
}) {
  const plots = [
    [260, 268],
    [384, 268],
    [256, 337],
    [387, 337],
  ];
  return (
    <svg
      viewBox="0 0 640 440"
      role="img"
      aria-label={
        label ??
        `Twój ogród: ${gardenStage(progress.earned)}. Ozdoby na ${progress.decorations.length} z czterech grządek.`
      }
    >
      <g className="ig-cloud ig-cloud-one" fill="#fffdf3">
        <ellipse cx="141" cy="80" rx="43" ry="12" />
        <circle cx="128" cy="73" r="18" />
        <circle cx="154" cy="76" r="14" />
      </g>
      <g className="ig-cloud ig-cloud-two" fill="#fffdf3">
        <ellipse cx="500" cy="124" rx="44" ry="11" />
        <circle cx="485" cy="117" r="17" />
        <circle cx="510" cy="122" r="13" />
      </g>
      <circle cx="483" cy="66" r="31" fill="#f5d276" />
      <circle
        cx="483"
        cy="66"
        r="42"
        fill="none"
        stroke="#efd68e"
        strokeDasharray="3 10"
        strokeWidth="3"
      />
      <ellipse
        cx="321"
        cy="359"
        rx="246"
        ry="58"
        fill="#d7d5b3"
        opacity=".45"
      />
      <path d="m78 270 241-130 245 130v30L322 429 78 300Z" fill="#c1b893" />
      <path
        d="m78 270 241-130 245 130-242 132Z"
        fill={progress.earned > 0 ? "#a6c082" : "#c1c9a5"}
      />
      <path d="M322 402v27l242-129v-30Z" fill="#aaa882" />
      <path d="m106 270 213-115 218 115-215 115Z" fill="#c4d59f" />
      <path d="m133 272 187-102 187 102-187 101Z" fill="#b2cb91" />
      <path d="m127 275 191-104 18 9-191 105Z" fill="#eef0cf" />
      <path d="m204 236 230 128 21-11-230-128Z" fill="#eef0cf" />
      <path d="m265 367 192-105 17 10-192 105Z" fill="#eef0cf" />
      <path
        d="m144 311 22-12m-3 22 22-12m-3 22 22-12"
        stroke="#f6f1d6"
        strokeWidth="8"
      />
      <g transform="translate(320 184)">
        <path d="m-28 11 28-17 30 17v44L1 72l-29-17Z" fill="#f6eed4" />
        <path d="M1 28v44l29-17V11Z" fill="#dfcfb0" />
        <path d="m-36 9 35-34L39 9 2 31Z" fill="#d87e62" />
        <path d="M-1-25 39 9 2 31Z" fill="#c36550" />
        <rect x="-18" y="28" width="12" height="20" rx="2" fill="#76a5a1" />
        <path d="M11 49v12l11-6V43Z" fill="#9a7456" />
        <path d="M-3-24V-39h8v20" fill="#bf6b54" />
      </g>
      {plots.map(([x, y], index) => (
        <g key={index}>
          <ellipse
            cx={x}
            cy={y + 10}
            rx="45"
            ry="25"
            fill={selectedSlot === index ? "#e3bd67" : "#94b47b"}
            stroke={selectedSlot === index ? "#6d6035" : "#88a66e"}
            strokeWidth={selectedSlot === index ? "2" : "1"}
            strokeDasharray={selectedSlot === index ? "5 4" : undefined}
          />
          {progress.decorations.find((item) => item.slot === index) ? (
            <Ornament
              id={
                progress.decorations.find((item) => item.slot === index)!.itemId
              }
              x={x}
              y={y}
            />
          ) : (
            <g stroke="#748c58" strokeWidth="2" strokeLinecap="round">
              <path d={`M${x - 7} ${y + 8}h14M${x} ${y + 2}v12`} />
            </g>
          )}
        </g>
      ))}
      {progress.earned >= 15 && (
        <g className="ig-sprout-in">
          <Ornament id="flowers" x={175} y={275} />
          <path
            d="M461 276v-17m0 10 8-9m-8 5-7-9"
            stroke="#507b49"
            strokeWidth="3"
          />
        </g>
      )}
      {progress.earned >= 40 && (
        <g className="ig-sprout-in">
          <Ornament id="tree" x={203} y={238} />
          <path d="m478 300 24-13 9 5-24 13Z" fill="#a36e50" />
          <path d="M483 305v11m20-22v11" stroke="#6d674a" strokeWidth="3" />
        </g>
      )}
      {progress.earned >= 75 && (
        <g className="ig-sprout-in">
          <Ornament id="tree" x={439} y={229} />
          <g className="ig-firefly" fill="#efb85a">
            <circle cx="130" cy="241" r="4" />
            <circle cx="418" cy="148" r="4" />
            <circle cx="502" cy="322" r="3" />
          </g>
        </g>
      )}
      {progress.kinds.includes("rest_place") && (
        <g className="ig-sprout-in" transform="translate(179 313)">
          <ellipse rx="32" ry="13" fill="#789a64" opacity=".3" />
          <path d="m-25-5 30-16 21 12-30 16Z" fill="#cb915c" />
          <path d="m-25-15 30-16v10l-30 16Z" fill="#deb17c" />
          <path d="M-22 0v10M20-8v10" stroke="#486545" strokeWidth="4" />
          <circle cx="27" cy="-26" r="12" fill="#f5d477" />
          <path
            d="m23-26 3 3 5-6"
            fill="none"
            stroke="#4b683e"
            strokeWidth="2"
          />
        </g>
      )}
      {progress.kinds.includes("step_free_entrance") && (
        <g className="ig-sprout-in">
          <path
            d="m331 241 31 17 23-12-31-17Z"
            fill="#f6e2ac"
            stroke="#d3bb86"
            strokeWidth="2"
          />
          <path
            d="m336 239 11 6m-4-10 11 6m-3-10 11 6"
            stroke="#fff7dc"
            strokeWidth="2"
          />
          <g transform="translate(376 209)">
            <path d="M0 27V0" stroke="#617849" strokeWidth="3" />
            <path d="M2 0h23l-5 8 5 8H2Z" fill="#f0cc74" />
            <path
              d="m8 8 3 3 5-6"
              stroke="#46603e"
              strokeWidth="2"
              fill="none"
            />
          </g>
        </g>
      )}
      <g fill="#678957">
        <path d="M128 277q-11-23-12 0m12 0q8-24 12-2M512 278q-11-23-12 0m12 0q8-24 12-2" />
        <path d="M300 370q-8-18-8 0m8 0q6-17 9-1" />
      </g>
    </svg>
  );
}
