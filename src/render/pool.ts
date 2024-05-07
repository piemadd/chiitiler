import * as path from 'path';

import mbgl from '@maplibre/maplibre-gl-native';
import genericPool from 'generic-pool';

import { getSource } from '../source.js';
import type { Cache } from '../cache/index.js';

const EMPTY_BUFFER = Buffer.alloc(0);
const TRANSPARENT_BUFFER: Record<string, Buffer> = {
    'png': Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64'),
    'webp': Buffer.from('UklGRiYAAABXRUJQVlA4TA0AAAAvAAAAEAcQERGIiP4HAA==', 'base64'),
    'jpeg': Buffer.from('/9j/4AAQSkZJRgABAQEAYABgAAD/4QA6RXhpZgAATU0AKgAAAAgAA1IBAAABTAAKAAAABwAAAABkAQMAAAABAAAA+gEBAAMAAAABAAEAAKACAAQAAAABAAABPKADAAQAAAABAAAA+AAAAABIAAAAAQAAAEgAAAABAAOgAQADAAAAAQABAACgAgAEAAAAAQAAAGmHBAABAAAAAQAAAGgAAAAAAElFQyBvU3BhLjEgNjIgTWFjaW50b3NoKFBsdWdpbnMgTWFj...'),
}

function handleFileType(uri: string) {
    // extract extension only, take into account query string or hash
    const basename = path.basename(uri).split(/[?#]/)[0];
    const ext = basename.split('.').pop();
    if (ext === undefined) return null;
    const l = ext.toLowerCase();
    if (l === 'jpeg') return 'jpg';
    return l;
}

// key:value = styleJsonString:Pooled Map Instance
const mapPoolDict: Record<string, genericPool.Pool<mbgl.Map>> = {};
function getRenderPool(
    styleUrl: string,
    cache: Cache,
    mode: 'tile' | 'static',
) {
    const dictKey = `${styleUrl}-${mode}`;
    if (mapPoolDict[dictKey] === undefined) {
        const styleJsonBuf = getSource(styleUrl, cache);
        const pool = genericPool.createPool({
            create: async () => {
                const map = new mbgl.Map({
                    request: function (req, callback) {
                        getSource(req.url, cache)
                            .then((buf) => {
                                if (buf) {
                                    callback(undefined, { data: buf });
                                    return
                                }
                                const ext = handleFileType(req.url);
                                if (ext && TRANSPARENT_BUFFER[ext])
                                    callback(undefined, { data: TRANSPARENT_BUFFER[ext] });
                                else
                                    callback(undefined, { data: EMPTY_BUFFER });

                            })
                            .catch(() => {
                                const ext = handleFileType(req.url);
                                if (ext && TRANSPARENT_BUFFER[ext])
                                    callback(undefined, { data: TRANSPARENT_BUFFER[ext] });
                                else
                                    callback(undefined, { data: EMPTY_BUFFER });
                            });
                    },
                    ratio: 1,
                    // @ts-ignore
                    mode,
                });
                map.load(JSON.parse((await styleJsonBuf)!.toString()));
                return map;
            },
            destroy: async (map: mbgl.Map) => {
                map.release();
            },
        });
        mapPoolDict[dictKey] = pool;
    }
    return mapPoolDict[dictKey];
}

export { getRenderPool };
