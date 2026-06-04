# ehAye Multimedia

Use this skill for **video, audio, images, media conversion, previews, transcription, thumbnails, frame extraction, Spotter visual search, or FFmpeg-backed processing**.

Core rule: use ehAye native media tools first. Do not reach first for shell `ffmpeg`, `ffprobe`, Python, or `mediainfo` when a native media tool can do the job. Native tools use bundled engines, show proper tool UI, respect cancellation/timeouts, integrate with Preview/Spotter, and avoid cross-platform shell quoting problems.

## Tools

### `media_preflight`

Use before local transcription.

Typical call:

```text
MediaPreflight(type=transcribe, path=<audio-or-video>)
```

It probes duration and estimates transcription speed. Use its recommended `within` value when calling transcription.

### `media_process`

Use for FFmpeg-engine work and local transcription.

Common parameters:

- `type=engine` — raw media-engine operation.
- `type=transcribe` — local English-mode speech-to-text.
- `args=[...]` — FFmpeg-style args for `type=engine`.
- `path=<file>` — media path for transcription.
- `format=markdown|summary` — transcription output shape.
- `outputPath=<path>` — optional transcription output path.
- `within=<ms>` — time budget; use the preflight recommendation for transcription.

Probe media:

```text
MediaProcess(type=engine, args=["-i", "<path>"])
```

FFmpeg may exit with "At least one output file must be specified" after printing metadata. Treat that as a successful probe: duration, streams, codecs, subtitles, and container info are in the output.

### `preview`

Use to open the in-app Preview lightbox for images, video, audio, markdown, text, and files.

Common parameters:

- `path=<file>` — artifact or local file to open.
- `seek` / `time` — video timestamp in seconds or `HH:MM:SS`/`MM:SS` style.
- `muted=true` / `sound=off` — start silent.
- `autoplay=true` — start playback automatically when possible.
- `zoom=<number>` — initial image zoom, e.g. `0.90`.
- `label=<text>` — friendly title.

Useful visible form:

```text
Preview(type=image, zoom=0.90)
Preview(type=video, time=154s, sound=off)
Preview(type=md)
Preview(type=txt)
```

Default to safe audio. When opening video/audio automatically, start muted or low volume unless the user asked for sound. The volume slider should match the actual mute state: volume zero means muted; moving above zero unmutes.

Preview can seek an already-open video **without reloading** if the same media path is used. During Spotter/visual search, keep the preview moving: call `preview` repeatedly with the same video path and new timestamps so the user can watch candidate scrubbing live.

## WebView playback and MP4 remuxing

The Preview lightbox uses native WebView playback. It is fast for compatible MP4/WebM, but containers like `.mkv`, `.avi`, `.flv`, `.wmv`, `.ts`, `.m2ts`, or `.mov` with unsupported codecs may show a black frame, `0:00`, no sound, or no seeking.

Do not fight the browser. Create a previewable MP4 copy.

Prefer **fast remux** first when streams are MP4-compatible, such as H.264 video and AAC audio:

```text
MediaProcess(type=engine, args=["-i", "<input>", "-c", "copy", "-movflags", "+faststart", "<output>.mp4"])
```

If carrying SRT subtitles into MP4, convert subtitles to `mov_text`:

```text
MediaProcess(type=engine, args=["-i", "<input>", "-map", "0", "-c", "copy", "-c:s", "mov_text", "-movflags", "+faststart", "<output>.mp4"])
```

Only transcode when stream-copy fails because codecs are not MP4-compatible:

```text
MediaProcess(type=engine, args=["-i", "<input>", "-c:v", "libx264", "-c:a", "aac", "-movflags", "+faststart", "<output>.mp4"])
```

Converted-copy policy:

1. Write the converted copy next to the original file.
2. Keep the same base name and use the new extension, usually `.mp4`.
3. Never modify or delete the original.
4. Use and reference the converted copy from that point on.
5. Tell the user where the copy was created.

Example:

```text
/path/to/show.mkv
/path/to/show.mp4
```

## Local transcription

`MediaProcess(type=transcribe)` is local and currently English-mode only.

Workflow:

1. Call `MediaPreflight(type=transcribe, path=<file>)`.
2. Tell the user transcription will be treated as English (`lang=en`).
3. Call `MediaProcess(type=transcribe, path=<file>, format=markdown, within=<recommended>)`.
4. Report the markdown timeline path.
5. Say: "Please check accuracy before relying on it."
6. Open the markdown timeline with Preview: `Preview(type=md)`.

Markdown transcript previews should preserve timestamps and timeline structure.

## Spotter visual search

Use `media_spotter` when the user asks to find a person, object, logo, scene, or reference image inside video.

Spotter is **LLM-powered**. Do not describe it as local face recognition. Local media processing prepares candidates; the active vision model decides semantic matches such as "Rachel," "this woman," or "the first time this object appears."

Good Spotter behavior:

- Start with a bounded candidate set.
- Preview the source video at each promising timestamp.
- Keep seeking the already-open Preview as candidates change.
- Leave Preview at the best match.
- Report exact timestamp plus evidence path/frame when available.
- Be honest about uncertainty and one-second offsets.

## 3×3 contact-sheet workflow

When visual matching is expensive or ambiguous, use a human-assisted loop:

1. Generate or collect candidate frames.
2. Pick the 9 closest or most representative candidates.
3. Build a 3×3 contact sheet/sprite with large labels and timestamps, e.g. `A1 00:02:13`.
4. Open it with `Preview(type=image, zoom=...)`.
5. Ask the user to choose the closest tile.
6. Jump Preview to that tile's source timestamp and refine nearby.

This is ideal when many frames look similar, model confidence is low, or the user can identify the target faster than more model calls.

## Thumbnails and frame extraction

For thumbnails, stills, or evidence frames, use `MediaProcess(type=engine)` with FFmpeg args. Prefer concise JPEG/PNG outputs in an artifact directory or next to the source when the user needs a persistent result.

Examples:

```text
MediaProcess(type=engine, args=["-ss", "00:02:13", "-i", "<video>", "-frames:v", "1", "<frame>.jpg"])
MediaProcess(type=engine, args=["-i", "<video>", "-vf", "fps=1", "<frames-dir>/frame-%06d.jpg"])
```

Preview extracted frames with `Preview(type=image)`.

## Reporting

Always tell the user:

- what was created,
- where it was written,
- whether it was remuxed or transcoded,
- whether quality was preserved,
- the timestamp(s) found,
- and when transcription accuracy must be checked.

Prefer showing evidence through Preview over dumping long paths or raw media-engine output.

> **Creator:** Ehaye
> **License:** MIT
> **Source Repo:** `neekware/ehaye-skills`
> **Source Bucket:** `ehaye`
> **Original Path:** `ehaye/multimedia`
