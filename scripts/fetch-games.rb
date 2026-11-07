#!/usr/bin/env ruby
# Downloads each game's release build into site/<path>, as pinned in site/_data/games.yml.
#   ruby scripts/fetch-games.rb
# A game already at its pinned version (site/<path>/.release) is skipped. A site/<path> that is a symlink is left alone,
# so a local build can stand in:  ln -s ~/projects/four43/harvest/dist site/exp/harvest
require 'yaml'
require 'net/http'
require 'fileutils'
require 'open3'

ROOT = File.expand_path('..', __dir__)

def download(url, redirects = 5)
  raise "too many redirects: #{url}" if redirects.zero?
  res = Net::HTTP.get_response(URI(url))
  case res
  when Net::HTTPSuccess then res.body
  when Net::HTTPRedirection then download(res['location'], redirects - 1)
  else raise "GET #{url}: #{res.code} #{res.message}"
  end
end

YAML.load_file(File.join(ROOT, 'site/_data/games.yml')).each do |name, game|
  dir = File.join(ROOT, 'site', game.fetch('path'))
  release = "#{game.fetch('repo')}@#{game.fetch('version')}"
  if File.symlink?(dir)
    puts "#{name}: site/#{game['path']} is a symlink, left as it is"
    next
  end
  stamp = File.join(dir, '.release')
  if File.exist?(stamp) && File.read(stamp).strip == release
    puts "#{name}: #{release} already in place"
    next
  end
  tarball = download("https://github.com/#{game['repo']}/releases/download/#{game['version']}/site.tar.gz")
  tmp = "#{dir}.download"
  FileUtils.rm_rf(tmp)
  FileUtils.mkdir_p(tmp)
  out, status = Open3.capture2e('tar', '-xzf', '-', '-C', tmp, stdin_data: tarball, binmode: true)
  raise "#{name}: tar failed: #{out}" unless status.success?
  File.write(File.join(tmp, '.release'), "#{release}\n")
  FileUtils.rm_rf(dir)
  FileUtils.mv(tmp, dir)
  puts "#{name}: #{release} -> site/#{game['path']}"
end
