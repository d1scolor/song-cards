const filler = new Set(
  "a an the i me my we our you your want wants would like please play playing listen hear to some any song songs music about related could can for of on with sing".split(
    " "
  )
);

function words(value: string) {
  return value
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLocaleLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);
}

function similarity(left: string, right: string) {
  if (left === right) return 1;
  if (
    left.length < 4 ||
    right.length < 4 ||
    Math.abs(left.length - right.length) > 2
  )
    return 0;
  if (right.startsWith(left) || left.startsWith(right)) return 0.85;
  let row = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let i = 1; i <= left.length; i++) {
    const next = [i];
    for (let j = 1; j <= right.length; j++)
      next[j] = Math.min(
        next[j - 1] + 1,
        row[j] + 1,
        row[j - 1] + (left[i - 1] === right[j - 1] ? 0 : 1)
      );
    row = next;
  }
  const distance = row[right.length];
  return distance <=
    Math.min(2, Math.floor(Math.max(left.length, right.length) / 4))
    ? 1 - distance / Math.max(left.length, right.length)
    : 0;
}

export function rankSongMatches<T extends { title: string; artist: string }>(
  songs: T[],
  query: string
): T[] {
  const terms = [
    ...new Set(words(query).filter((word) => !filler.has(word)))
  ].slice(0, 12);
  if (!terms.length) return [];
  const entries = songs.map((song) => ({
    song,
    title: words(song.title),
    artist: words(song.artist)
  }));
  const weights = terms.map(
    (term) =>
      1 +
      Math.log(
        (songs.length + 1) /
          (1 +
            entries.filter((entry) =>
              [...entry.title, ...entry.artist].some(
                (word) => similarity(term, word) > 0
              )
            ).length)
      )
  );
  return entries
    .map((entry) => {
      let matched = 0;
      const score = terms.reduce((total, term, index) => {
        const title = Math.max(
          0,
          ...entry.title.map((word) => similarity(term, word))
        );
        const artist = Math.max(
          0,
          ...entry.artist.map((word) => similarity(term, word))
        );
        if (title || artist) matched++;
        return total + weights[index] * Math.max(title * 3, artist);
      }, 0);
      return { song: entry.song, score: score * (matched / terms.length) };
    })
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 8)
    .map((entry) => entry.song);
}
