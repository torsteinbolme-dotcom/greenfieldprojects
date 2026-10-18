import { describe, expect, it } from "vitest";
import { COVER_BUCKET, DEFAULT_COVER_URL, coverPath, coverSrc } from "@/lib/covers";

const ORG = "94e4548c-79a8-40eb-aae9-94cd811579b0";
const PROJECT = "d4396a5a-2316-4103-bb21-f38d20e8c4d9";
const PATH = `${ORG}/${PROJECT}.jpg`;

describe("project cover photos", () => {
  it("saves each photo in the organisation folder, named after the project", () => {
    expect(coverPath(ORG, PROJECT, "jpg")).toBe(PATH);
    expect(coverPath(ORG, PROJECT, "photo.PNG")).toBe(`${ORG}/${PROJECT}.png`);
    // anything that is not a picture falls back to jpg, and the organisation
    // folder stays the first path segment so the bucket rules can check it
    expect(coverPath(ORG, PROJECT, "svg")).toBe(PATH);
    expect(coverPath(ORG, PROJECT, "sh.exe")).toBe(PATH);
    expect(coverPath(ORG, PROJECT).split("/")[0]).toBe(ORG);
  });

  it("shows the project's own photo, and the placeholder when there is none", () => {
    expect(coverSrc({ cover_image_url: PATH }, { [PATH]: "https://signed/one" })).toBe("https://signed/one");
    expect(coverSrc({ cover_image_url: null }, {})).toBe(DEFAULT_COVER_URL);
    // saved photo whose signed URL is missing -> placeholder, never a broken image
    expect(coverSrc({ cover_image_url: PATH }, {})).toBe(DEFAULT_COVER_URL);
    expect(DEFAULT_COVER_URL).toContain("/default.jpg");
    expect(COVER_BUCKET).toBe("project-covers");
  });
});
