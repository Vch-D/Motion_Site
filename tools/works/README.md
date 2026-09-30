# Видео для вкладки WORKS

`manifest.py` — список работ в порядке показа (лучшие первые), названия, клиент, тип, секунда постера.
`build.py` — из исходников (`~/Downloads/Claude_WORKS`) делает в `assets/works/`:
`<slug>.mp4` 720p (H.264, CRF 23, ≤ 2.6 Мбит/с, 60→30 и 50→25 fps, AAC 96k), `<slug>-sm.mp4` 480p (≤ 1 Мбит/с),
`<slug>.webp` постер 960×540 (не-16:9 кадр кладётся на размытую копию) и `<slug>-blur.webp` 48×27 для
инлайн-подложки. Нужен ffmpeg: `pip3 install --user imageio-ffmpeg`.

Ролик `tradewise-ui` — пять лупов из `Loops/`, склеенных с кроссфейдами 0,5 с:

```bash
ffmpeg -i CumulativePNL.mp4 -i Seasonality.mp4 -i "Comparison ChartComp.mp4" -i Calendar.mp4 -i "AI Chat Mockup.mp4" \
  -filter_complex "[0:v][1:v]xfade=transition=fade:duration=0.5:offset=8.5[v1];[v1][2:v]xfade=transition=fade:duration=0.5:offset=20[v2];[v2][3:v]xfade=transition=fade:duration=0.5:offset=31.5[v3];[v3][4:v]xfade=transition=fade:duration=0.5:offset=43[v4]" \
  -map "[v4]" -c:v libx264 -preset fast -crf 16 -pix_fmt yuv420p -an _mezzanine/tradewise-ui.mp4
```

После сборки карточки в `index.html` генерируются из `built.json` (номер, название, длительность, base64 подложки).
