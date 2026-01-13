# typed: false
# frozen_string_literal: true

cask "conflux" do
  version "0.2.7"

  on_intel do
    sha256 "9e37182a94de96ecdcabfa1bebd12c20e4dbdddfe8a23b7b23ba7b90a34d6ae0"
    url "https://github.com/veildawn/conflux-app/releases/download/v#{version}/Conflux_#{version}_x64.dmg",
        verified: "github.com/veildawn/conflux-app/"
  end

  on_arm do
    sha256 "4df8b85601dfde73c8843c4ed885e8f83abe68c5411bf56aaf68b60046f44888"
    url "https://github.com/veildawn/conflux-app/releases/download/v#{version}/Conflux_#{version}_aarch64.dmg",
        verified: "github.com/veildawn/conflux-app/"
  end

  name "Conflux"
  desc "Modern proxy management app based on MiHomo"
  homepage "https://github.com/veildawn/conflux-app"

  livecheck do
    url :url
    strategy :github_latest
  end

  app "Conflux.app"

  postflight do
    # Remove quarantine attribute for unsigned app
    system_command "/usr/bin/xattr",
                   args: ["-rd", "com.apple.quarantine", "#{appdir}/Conflux.app"],
                   sudo: false
  end

  zap trash: [
    "~/Library/Application Support/com.conflux.desktop",
    "~/Library/Caches/com.conflux.desktop",
    "~/Library/Preferences/com.conflux.desktop.plist",
    "~/Library/Saved Application State/com.conflux.desktop.savedState",
  ]
end
