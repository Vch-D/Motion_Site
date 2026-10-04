# Works on the site, in order (best first). src is relative to SRC unless absolute; poster = second of the poster frame;
# cands were the frames looked at when choosing it. Titles / client / kind are printed on the cards.
SRC = '/Users/mp/Downloads/Claude_WORKS'
MEZ = '/Users/mp/Downloads/Claude_WORKS/_mezzanine'   # tradewise-ui.mp4 = the five Loops joined with 0.5 s crossfades (see README)
WORKS = [
 dict(slug='fiba-game-time',    src='Final_NEW_SFX_LUFS_v1.mp4',     title='Game Time!',               client='FIBA Women’s Basketball World Cup 2026', kind='Mascot animation', poster=19.5, cands=[2.5, 19.5, 22.5]),
 dict(slug='iihf-housekeeping', src='Housekeeping_nomascot.mp4',     title='In the Rink',              client='IIHF World Championship 2026',               kind='Arena housekeeping', poster=59.5, cands=[31, 46.5, 54]),
 dict(slug='sparta-housekeeping', src='Housekeeping_preview_LUFS.mp4', title='Naše Sparta',       client='HC Sparta Praha',                            kind='Arena housekeeping', poster=22, cands=[16.5, 45, 60]),
 dict(slug='tradewise-film',    src='TradeWiseMain (1).mp4',         title='No Ordinary Trading',      client='Tradewise',                                  kind='Product teaser', poster=46, cands=[3, 20, 46]),
 dict(slug='ai-hub',            src='AI Hub trailer last fix.mp4',   title='AI Hub',                   client='Victoria VR',                                kind='Trailer', poster=2, cands=[2, 11.5, 34]),
 dict(slug='magic-madness',     src='Final.mp4',                     title='Magic Madness VR',         client='Victoria VR',                                kind='Game trailer', poster=2.5, cands=[1.5, 36.7, 40]),
 dict(slug='ai-agent',          src='Ai agent is waiting.mp4',       title='Your AI Agent Is Waiting', client='Victoria VR',                                kind='Promo', poster=18.5, cands=[8, 18.5, 20.3]),
 dict(slug='epic-skins',        src='Final_With_CTA.mp4',            title='Epic Skins',               client='Magic Madness VR',                           kind='Trailer', poster=22, cands=[19, 32, 45]),
 dict(slug='wishlist',          src='Trailer_Website.mp4',           title='Add to Wishlist',          client='Magic Madness VR',                           kind='Gameplay trailer', poster=27.5, cands=[8, 27.5, 29.5]),
 dict(slug='new-emotes',        src='Final_SFX_1.mp4',               title='New Emotes',               client='Magic Madness VR',                           kind='Update trailer', poster=1, cands=[1, 10.5, 12.8]),
 dict(slug='fiba-teaser',       src='Preview_2_Version.mp4',         title='Mascot Teaser',            client='FIBA Women’s Basketball World Cup 2026', kind='Character animation', poster=15, cands=[2.5, 5, 15]),
 dict(slug='tradewise-ui',      src=MEZ + '/tradewise-ui.mp4', title='Product UI', client='Tradewise', kind='UI animation', poster=5, cands=[5, 30, 42]),
 dict(slug='comics',            src='Comics.mp4',                    title='Comics',                   client='Magic Madness VR',                           kind='Motion comic', poster=4.3, cands=[2.2, 4.3, 6.5]),
 dict(slug='vr-ai-terminal',    src='Render_Sounds.mp4',             title='VR AI Terminal',           client='Victoria VR',                                kind='Promo', poster=15.5, cands=[1, 13, 15.5]),
 dict(slug='metaverse',         src='For_WEB_New_01.mp4',            title='Metaverse Showcase',       client='Victoria VR',                                kind='Showcase video', poster=4, cands=[2, 8, 40]),
 dict(slug='out-now',           src='!_OUT_NOW_PACKSHOT.mp4',        title='Out Now',                  client='Magic Madness VR',                           kind='Packshot', poster=4.5, cands=[1.5, 3, 4.5], loop=True),
 dict(slug='key-art',           src='All In One.mp4',                title='Key Art',                  client='Magic Madness VR',                           kind='Animated poster', poster=1.4, cands=[0.3, 1.4, 2.5], loop=True),
 dict(slug='milestone-post',    src='X_Post_Spatial.mp4',            title='Milestone Post',           client='Victoria VR',                                kind='Social', poster=3, cands=[1, 3, 5], loop=True),
 dict(slug='discord-banner',    src='Discord_Banner.mp4',            title='Discord Banner',           client='Magic Madness VR',                           kind='Social', poster=3, cands=[1.5, 3, 5], loop=True),
 dict(slug='inventory',         src='Render_01.mp4',                 title='Inventory',                client='Victoria VR',                                kind='UI animation', poster=5, cands=[2, 5, 8], loop=True),
]
