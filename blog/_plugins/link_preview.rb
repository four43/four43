require 'open-uri'
require 'nokogiri'
require 'json'
require 'digest'
require 'fileutils'

module Jekyll
  class LinkPreviewGenerator < Generator
    safe true
    priority :high

    def generate(site)
      cache_dir = File.join(site.source, '.link_preview_cache')
      FileUtils.mkdir_p(cache_dir)

      site.posts.docs.each do |post|
        link = post.data['link']
        next unless link

        preview = fetch_preview(link, cache_dir)
        post.data['link_preview'] = preview if preview
      end
    end

    private

    def fetch_preview(url, cache_dir)
      cache_file = File.join(cache_dir, Digest::MD5.hexdigest(url) + '.json')

      if File.exist?(cache_file) && (Time.now - File.mtime(cache_file)) < 86400
        return JSON.parse(File.read(cache_file))
      end

      begin
        html = URI.open(url,
          'User-Agent' => 'Mozilla/5.0 (compatible; JekyllLinkPreview/1.0)',
          read_timeout: 10,
          open_timeout: 10
        ).read

        doc = Nokogiri::HTML(html)

        preview = {
          'title' => og_content(doc, 'og:title') || doc.at_css('title')&.text&.strip,
          'description' => og_content(doc, 'og:description') || meta_content(doc, 'description'),
          'image' => og_content(doc, 'og:image'),
          'site_name' => og_content(doc, 'og:site_name'),
          'domain' => URI.parse(url).host.sub(/^www\./, ''),
          'url' => url
        }

        File.write(cache_file, JSON.generate(preview))
        preview
      rescue => e
        Jekyll.logger.warn "LinkPreview:", "Failed to fetch #{url}: #{e.message}"
        {
          'url' => url,
          'domain' => URI.parse(url).host.sub(/^www\./, '')
        }
      end
    end

    def og_content(doc, property)
      doc.at_css("meta[property='#{property}']")&.[]('content')
    end

    def meta_content(doc, name)
      doc.at_css("meta[name='#{name}']")&.[]('content')
    end
  end
end
