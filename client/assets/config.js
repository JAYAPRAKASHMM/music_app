window.MONIFY_CONFIG = {
  defaultSong: {
    id: 'n_fA0hU5-a4',
    url: 'https://youtu.be/n_fA0hU5-a4?si=3EZygpyeIBat5fJw',
    thumbnail: 'https://img.youtube.com/vi/n_fA0hU5-a4/hqdefault.jpg',
    durationSeconds: 120,
    note: 'JP likes this song',
  },
  streamResolver: async (input) => {
    const videoId = input?.videoId || input?.id || '';
    const quality = input?.preferredQuality || '128k';

    if (!videoId) {
      throw new Error('A valid videoId is required for stream resolution.');
    }

    const params = new URLSearchParams({
      videoId,
      quality,
    });

    const response = await fetch(`/api/stream-info?${params.toString()}`);
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'Failed to resolve stream info.');
    }

    return data;
  },
};
