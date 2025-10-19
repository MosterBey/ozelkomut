const { SlashCommandBuilder, ActionRowBuilder, StringSelectMenuBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, MessageFlags } = require('discord.js');
const nbx = require('noblox.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('rutbedegistir')
    .setDescription('Bir kullanıcıya rütbe verir (ana grup).')
    .addStringOption(option =>
      option.setName('kullanici').setDescription('Roblox kullanıcı adı').setRequired(true)
    )
    .addStringOption(option =>
      option.setName('sebep').setDescription('Sebep').setRequired(true)
    ),

  async execute(interaction) {
    const groupId = Number(process.env.GROUPID);
    const adminRoleId = process.env.ROLEID;
    const logChannelId = process.env.LOGCHANNELID;
    const MAX_DISPLAY = Number(process.env.MAX_DISPLAY_RANKS) || 15; 

    if (!interaction.member.roles.cache.has(adminRoleId))
      return interaction.reply({ content: '❌ Yetkin yok.', flags: MessageFlags.Ephemeral });

    const username = interaction.options.getString('kullanici');
    const reason = interaction.options.getString('sebep');
    const executor = interaction.user;

    let userId;
    try {
      userId = await nbx.getIdFromUsername(username);
    } catch {
      return interaction.reply({ content: '❌ Kullanıcı bulunamadı.', flags: MessageFlags.Ephemeral });
    }

    await nbx.setCookie(process.env.COOKIE);
    const roles = await nbx.getRoles(groupId);
    const ranks = roles
      .filter(r => r.rank <= 255) // 255 max rütbe
      .map((r, idx) => ({ name: r.name, value: r.rank, uniq: `${r.rank}_${idx}` }))
      .sort((a, b) => a.value - b.value);

    const displayRanks = ranks.slice(0, MAX_DISPLAY); 
    const totalPages = Math.ceil(displayRanks.length / 25); // select menü max 25 seçenek
    let page = 0;

    const generateMenu = () => {
      const slice = displayRanks.slice(page * 25, (page + 1) * 25);
      return new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId('select_rank')
          .setPlaceholder(`Rütbe seçiniz${totalPages > 1 ? ` (Sayfa ${page + 1}/${totalPages})` : ''}`)
          .addOptions(slice.map(r => ({ label: r.name, value: r.uniq })))
      );
    };

    const generateButtons = () => {
      if (totalPages <= 1) return [];
      return [new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('prev').setLabel('⬅️ Geri').setStyle(ButtonStyle.Secondary).setDisabled(page === 0),
        new ButtonBuilder().setCustomId('next').setLabel('➡️ İleri').setStyle(ButtonStyle.Secondary).setDisabled(page + 1 >= totalPages)
      )];
    };

    const message = await interaction.reply({
      content: `**${username}** için rütbe seçiniz:`,
      components: [generateMenu(), ...generateButtons()],
      fetchReply: true,
      flags: MessageFlags.Ephemeral
    });

    const collector = message.createMessageComponentCollector({ time: 120000 });

    collector.on('collect', async i => {
      if (i.user.id !== executor.id)
        return i.reply({ content: 'Bu menüyü sen kullanamazsın.', flags: MessageFlags.Ephemeral });

      if (i.isButton()) {
        if (i.customId === 'prev' && page > 0) page--;
        if (i.customId === 'next' && page + 1 < totalPages) page++;
        await i.update({ components: [generateMenu(), ...generateButtons()] });
        return;
      }

      if (i.isStringSelectMenu()) {
        await i.deferUpdate();
        const selectedValue = i.values[0];
        const selectedRank = parseInt(selectedValue.split('_')[0]);

        const oldRank = await nbx.getRankInGroup(groupId, userId);
        const oldRankName = await nbx.getRankNameInGroup(groupId, userId);
        const setResult = await nbx.setRank(groupId, userId, selectedRank);
        const newRankName = setResult.newRole?.name || (roles.find(r => r.rank === selectedRank)?.name || `Rütbe ${selectedRank}`);

        const embed = new EmbedBuilder()
          .setTitle('📌 Rütbe Değişikliği')
          .setColor('Blue')
          .addFields(
            { name: '👤 Kullanıcı', value: `${username} (ID: ${userId})` },
            { name: '🔻 Eski Rütbe', value: `${oldRank} - ${oldRankName}`, inline: true },
            { name: '🔺 Yeni Rütbe', value: `${newRankName}`, inline: true },
            { name: '📝 Sebep', value: reason },
            { name: '🛠️ Yetkili', value: `${executor.tag} (${executor.id})` }
          )
          .setTimestamp();

        await interaction.editReply({ content: `✅ ${username} kullanıcısının rütbesi **${newRankName}** olarak güncellendi.`, components: [] });

        const logChannel = interaction.client.channels.cache.get(logChannelId);
        if (logChannel) await logChannel.send({ embeds: [embed] });

        collector.stop();
      }
    });

    collector.on('end', () => {
      interaction.editReply({ components: [] }).catch(() => {});
    });
  }
};
