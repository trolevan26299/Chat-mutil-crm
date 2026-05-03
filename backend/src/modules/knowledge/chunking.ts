/**
 * chunking.ts
 * Splits raw text into overlapping chunks for vector indexing.
 * Strategy: paragraph-aware splitting with overlap window.
 */

const CHUNK_SIZE = 800;    // characters per chunk
const CHUNK_OVERLAP = 150; // overlap between consecutive chunks

/**
 * Splits text into overlapping chunks, respecting paragraph boundaries where possible.
 */
export function chunkText(text: string): string[] {
  // Normalize whitespace
  const normalized = text.replace(/\r\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();

  if (normalized.length <= CHUNK_SIZE) {
    return [normalized];
  }

  const chunks: string[] = [];
  let start = 0;

  while (start < normalized.length) {
    let end = start + CHUNK_SIZE;

    if (end >= normalized.length) {
      chunks.push(normalized.slice(start).trim());
      break;
    }

    // Try to break at paragraph boundary
    const paragraphBreak = normalized.lastIndexOf('\n\n', end);
    if (paragraphBreak > start + CHUNK_SIZE / 2) {
      end = paragraphBreak;
    } else {
      // Fall back to sentence boundary
      const sentenceBreak = normalized.lastIndexOf('. ', end);
      if (sentenceBreak > start + CHUNK_SIZE / 2) {
        end = sentenceBreak + 1;
      }
    }

    chunks.push(normalized.slice(start, end).trim());
    start = end - CHUNK_OVERLAP;
  }

  return chunks.filter(c => c.length > 50); // discard tiny fragments
}

import * as cheerio from 'cheerio';
import { logger } from '../../shared/utils/logger.js';

/**
 * Parses text from a URL by fetching and crawling internal subpages.
 * Max limit: defined by maxPages (default: 50).
 */
export async function fetchUrlContent(baseUrl: string, maxPages: number = 50): Promise<string> {
  const visited = new Set<string>();
  const toVisit = [baseUrl];
  let fullText = '';
  
  // Track seen lines across ALL pages to eliminate repetitive menus/sidebars
  const globalSeenLines = new Set<string>();

  let baseOrigin = '';
  try {
    baseOrigin = new URL(baseUrl).origin;
  } catch {
    throw new Error(`Invalid URL: ${baseUrl}`);
  }

  while (toVisit.length > 0 && visited.size < maxPages) {
    const url = toVisit.shift()!;
    if (visited.has(url)) continue;
    visited.add(url);

    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; ZaloCRM-RAG/1.0)' },
        signal: AbortSignal.timeout(10000),
      });

      if (!res.ok) continue;

      const html = await res.text();
      const $ = cheerio.load(html);

      // Strip noise
      $('script, style, nav, footer, header, iframe, aside').remove();
      
      // Inject newlines after block elements to ensure .text() splits properly into lines
      $('p, div, br, h1, h2, h3, h4, h5, h6, li, tr').each((_, el) => {
        $(el).append('\n');
      });

      // Extract and deduplicate text line-by-line
      const rawText = $('body').text();
      const lines = rawText.split('\n');
      const uniqueLines: string[] = [];

      for (let line of lines) {
        line = line.replace(/\s{2,}/g, ' ').trim();
        if (line.length < 15) continue; // Ignore very short generic words

        const fingerprint = line.toLowerCase();
        if (!globalSeenLines.has(fingerprint)) {
          globalSeenLines.add(fingerprint);
          uniqueLines.push(line);
        }
      }
        
      const text = uniqueLines.join('\n');
      if (text) {
        fullText += `\n\n--- Source: ${url} ---\n\n${text}`;
      }

      // Find internal links
      $('a').each((_, el) => {
        const href = $(el).attr('href');
        if (href) {
          try {
            const parsed = new URL(href, url);
            // Only crawl same domain, ignore fragments
            parsed.hash = '';
            // Ignore some common file extensions
            if (/\.(jpg|png|pdf|zip|mp4|webp)$/i.test(parsed.pathname)) return;

            const cleanUrl = parsed.toString();
            
            if (parsed.origin === baseOrigin && !visited.has(cleanUrl) && !toVisit.includes(cleanUrl)) {
              toVisit.push(cleanUrl);
            }
          } catch {
            // Invalid URL, ignore
          }
        }
      });
      
      // Small delay
      await new Promise(r => setTimeout(r, 200));
    } catch (err) {
      logger.warn(`[knowledge] Failed to crawl ${url}:`, String(err));
    }
  }

  return fullText.trim();
}
