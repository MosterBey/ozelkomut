const { SlashCommandBuilder, PermissionFlagsBits } = require("discord.js");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("duyuru")
    .setDescription("Belirlenen sunucuların belirlenen kanallarında duyuru yapar.")
    .addStringOption(option =>
      option
        .setName("mesaj")
        .setDescription("Gönderilecek duyuru mesajı")
        .setRequired(true)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction) {
    const mesaj = interaction.options.getString("mesaj");
    const rawPairs = (process.env.DUYURU_CHANNELS || "")
      .split(",")
      .map(p => p.trim())
      .filter(Boolean);

    if (!rawPairs.length) {
      return interaction.reply({
        content: "❌ Duyuru yapılacak kanal ID'leri tanımlı değil (.env dosyasına `DUYURU_CHANNELS=GUILDID:CHANNELID,...` şeklinde ekleyin).",
        ephemeral: true,
      });
    }

    let basarili = 0;
    const hatalar = [];

    for (const pair of rawPairs) {
      // validation
      const [guildId, channelId] = pair.split(":").map(x => x && x.trim());
      if (!guildId || !channelId) {
        hatalar.push({ pair, reason: "Geçersiz format (beklenen: GUILDID:CHANNELID)" });
        continue;
      }

      try {
        // Önce doğrudan kanalı client üzerinden fetch etmeyi dene (bot başka sunucularda da görebilir)
        let channel = await interaction.client.channels.fetch(channelId).catch(() => null);

        // Kanal bulunamadıysa guild üzerinden fetch dene
        if (!channel) {
          const guild = await interaction.client.guilds.fetch(guildId).catch(() => null);
          if (!guild) {
            hatalar.push({ pair, reason: "Sunucu bulunamadı veya bot o sunucuda değil" });
            continue;
          }
          channel = await guild.channels.fetch(channelId).catch(() => null);
          if (!channel) {
            hatalar.push({ pair, reason: "Kanal bulunamadı (ID yanlış olabilir veya kanal silinmiş)" });
            continue;
          }
        }

        // Kanal metin tabanlı mı?
        if (!channel.isTextBased()) {
          hatalar.push({ pair, reason: "Hedef kanal metin tabanlı değil" });
          continue;
        }

        // Göndermeden önce izin kontrolü (eğer kanal bir guild'e aitse)
        if (channel.guild) {
          const botMember = await channel.guild.members.fetch(interaction.client.user.id).catch(() => null);
          if (botMember) {
            const canSend = channel.permissionsFor(botMember)?.has(PermissionFlagsBits.SendMessages);
            if (!canSend) {
              hatalar.push({ pair, reason: "Botun bu kanalda SEND_MESSAGES izni yok" });
              continue;
            }
          }
        }

        // Mesaj gönder
        await channel.send({ content: `📢 **DUYURU**\n${mesaj}` });
        basarili++;
      } catch (err) {
        // Hataları yakala, raporla
        hatalar.push({ pair, reason: `Mesaj gönderilemedi: ${err.message || err}` });
      }
    }

    // Yanıtı derle
    let reply = `📣 Duyuru tamamlandı:\n✅ Başarılı: **${basarili}**\n❌ Hatalı: **${hatalar.length}**`;

    if (hatalar.length) {
      // Çok uzun olmasın diye en fazla 10 hatayı göster
      const list = hatalar.slice(0, 10).map(h => `• \`${h.pair}\` — ${h.reason}`).join("\n");
      reply += `\n\n🔍 Hatalar (örnek):\n${list}`;
      if (hatalar.length > 10) reply += `\n… ve ${hatalar.length - 10} tane daha. (Console'da tüm detaylar)`;
      console.warn("Duyuru hataları:", hatalar);
    }

    return interaction.reply({ content: reply, ephemeral: true });
  },
};
