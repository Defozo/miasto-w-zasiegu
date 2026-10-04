import {
  PASSPORT_FIELD_DEFINITIONS,
  type PassportContent,
  type PassportFact,
  type PassportFieldKey,
  type PassportInputFields,
  type PlacePassport,
} from "../../../shared/place-passports.mjs";

export function previewPassport(
  placeId: string,
  content: PassportContent,
  displayName: string,
): PlacePassport {
  function fields(input: PassportInputFields) {
    return Object.fromEntries(
      PASSPORT_FIELD_DEFINITIONS.map(({ key }) => {
        const value = input[key]?.value ?? null;
        return [
          key,
          {
            value,
            status: value === null ? "unknown" : "unverified",
            evidence:
              value === null
                ? []
                : [
                    {
                      id: `preview-${key}`,
                      value,
                      source: {
                        kind: "user",
                        label:
                          input[key].sourceLabel ||
                          "Dane dodane przez użytkownika",
                        url: input[key].sourceUrl ?? null,
                      },
                      author: { displayName },
                      observedAt: input[key].observedAt ?? null,
                      publishedAt: null,
                      recordUpdatedAt: null,
                      siteVerification: null,
                    },
                  ],
          } satisfies PassportFact,
        ];
      }),
    ) as Record<PassportFieldKey, PassportFact>;
  }
  return {
    placeId,
    revision: 0,
    publishedAt: null,
    place: {
      id: placeId,
      ...content.place,
      coordinates: content.place.coordinates ?? [0, 0],
    },
    fields: fields(content.fields),
    entrances: content.entrances.map((entrance) => ({
      ...entrance,
      fields: fields(entrance.fields),
    })),
    sourcePlace: null,
    metadataEvidence: {},
  };
}
