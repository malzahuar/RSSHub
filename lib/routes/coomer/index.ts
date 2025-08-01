import { Route } from '@/types';

import got from '@/utils/got';
import { load } from 'cheerio';
import { parseDate } from '@/utils/parse-date';
import { art } from '@/utils/render';
import path from 'node:path';

export const route: Route = {
    path: '/:source?/:id?',
    categories: ['multimedia'],
    example: '/coomer',
    parameters: { source: 'Source, see below, Posts by default', id: 'User id, can be found in URL' },
    features: {
        requireConfig: false,
        requirePuppeteer: false,
        antiCrawler: false,
        supportBT: false,
        supportPodcast: false,
        supportScihub: false,
        nsfw: true,
    },
    radar: [
        {
            source: ['coomer.st/:source/user/:id', 'coomer.st/'],
        },
    ],
    name: 'Posts',
    maintainers: ['nczitzk', 'AiraNadih'],
    handler,
    description: `Sources

| Posts | OnlyFans | Fansly | CandFans |
| ----- | -------- | ------- | -------- |
| posts | onlyfans | fansly   | candfans |

::: tip
  When \`posts\` is selected as the value of the parameter **source**, the parameter **id** does not take effect.
  There is an optinal parameter **limit** which controls the number of posts to fetch, default value is 25.
:::`,
};

async function handler(ctx) {
    const limit = ctx.req.query('limit') ? Number.parseInt(ctx.req.query('limit')) : 25;
    const source = ctx.req.param('source') ?? 'posts';
    const id = ctx.req.param('id');
    const isPosts = source === 'posts';

    const rootUrl = 'https://coomer.st';
    const apiUrl = `${rootUrl}/api/v1`;
    const currentUrl = isPosts ? `${apiUrl}/posts` : `${apiUrl}/${source}/user/${id}`;

    const headers = {
        cookie: '__ddg2=sBQ4uaaGecmfEUk7',
    };

    const response = await got({
        method: 'get',
        url: currentUrl,
        headers,
    });
    const responseData = isPosts ? response.data.posts : response.data;

    const author = isPosts ? '' : await getAuthor(currentUrl, headers);
    const title = isPosts ? 'Coomer Posts' : `Posts of ${author} from ${source} | Coomer`;
    const image = isPosts ? `${rootUrl}/favicon.ico` : `https://img.coomer.st/icons/${source}/${id}`;
    const items = responseData
        .filter((i) => i.content || i.attachments)
        .slice(0, limit)
        .map((i) => {
            i.files = [];
            if ('path' in i.file) {
                i.files.push({
                    name: i.file.name,
                    path: i.file.path,
                    extension: i.file.path.replace(/.*\./, '').toLowerCase(),
                });
            }
            for (const attachment of i.attachments) {
                i.files.push({
                    name: attachment.name,
                    path: attachment.path,
                    extension: attachment.path.replace(/.*\./, '').toLowerCase(),
                });
            }
            const filesHTML = art(path.join(__dirname, 'templates/source.art'), { i });
            let $ = load(filesHTML);
            const coomerFiles = $('img, a, audio, video').map(function () {
                return $(this).prop('outerHTML')!;
            });
            let desc = '';
            if (i.content) {
                desc += `<div>${i.content}</div>`;
            }
            $ = load(desc);
            let count = 0;
            const regex = /downloads.fanbox.cc/;
            $('a').each(function () {
                const link = $(this).attr('href');
                if (regex.test(link!)) {
                    count++;
                    $(this).replaceWith(coomerFiles[count]);
                }
            });
            desc = (coomerFiles.length > 0 ? coomerFiles[0] : '') + $.html();
            for (const coomerFile of coomerFiles.slice(count + 1)) {
                desc += coomerFile;
            }

            let enclosureInfo = {};
            load(desc)('audio source, video source').each(function () {
                const src = $(this).attr('src') ?? '';
                const mimeType =
                    {
                        m4a: 'audio/mp4',
                        mp3: 'audio/mpeg',
                        mp4: 'video/mp4',
                    }[src.replace(/.*\./, '').toLowerCase()] || null;

                if (mimeType === null) {
                    return;
                }

                enclosureInfo = {
                    enclosure_url: new URL(src, rootUrl).toString(),
                    enclosure_type: mimeType,
                };
            });

            return {
                title: i.title || parseDate(i.published),
                description: desc,
                author,
                pubDate: parseDate(i.published),
                guid: `coomer:${i.service}:${i.user}:post:${i.id}`,
                link: `${rootUrl}/${i.service}/user/${i.user}/post/${i.id}`,
                ...enclosureInfo,
            };
        });

    return {
        title,
        image,
        link: isPosts ? `${rootUrl}/posts` : `${rootUrl}/${source}/user/${id}`,
        item: items,
    };
}

async function getAuthor(currentUrl, headers) {
    const profileResponse = await got({
        method: 'get',
        url: `${currentUrl}/profile`,
        headers,
    });
    return profileResponse.data.name;
}
