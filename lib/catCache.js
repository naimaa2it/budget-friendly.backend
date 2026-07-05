let _cache = null;
let _ts = 0;
const TTL_MS = 30_000; // 30 seconds

export const getCatMemCache = () =>
  _cache && Date.now() - _ts < TTL_MS ? _cache : null;

export const setCatMemCache = (data) => {
  _cache = data;
  _ts = Date.now();
};

export const bustCatMemCache = () => {
  _cache = null;
  _ts = 0;
};
