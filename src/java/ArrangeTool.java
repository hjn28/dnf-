package com.quaint.lifeheler.dnf.team;

import java.io.*;
import java.nio.charset.StandardCharsets;
import java.util.*;
import java.util.stream.Collectors;

/**
 * @author quaint
 * @since 2026/6/25 8:54
 */
//@SuppressWarnings("all")
public class ArrangeTool {

    // --- 常量定义 ---
    private static final List<String> PLAYER_NAMES = List.of("三年", "淘气", "起源", "老王");
    //    private static final String roleTxtPath = "/team/role.txt";
    private static final String roleTxtPath = "/team/role.txt";

    // 用于计算 c * 奶的伤害达标门槛， 4000 千亿
    private static final int C_OVER_VAL = 2000; // c 2000e
    private static final int N_OVER_VAL = 2000; // 奶 2000倍
    private static final double MIX_BUFF_RATE = 0.12; // 群猎加成
    private static final double SUN_BUFF_RATE = 1.24; // 太阳奶加成

    // 伤害最低的最后几个队伍 优先补人，一般是大的副c，其余的按总伤害从高到低选，正常是大c先选，刚好选混子
    private static final int lastPreNum = -1;

    // --- 实体类 ---
    static class Role {
        String owner;
        boolean isC;
        double value;
        String buffValue;
        boolean isBuffMix;
        boolean isXiaoMonv;
        boolean used; // 是否已出战
    }

    static class PlayerEntity {
        List<Role> cList = new ArrayList<>();
        List<Role> naiList = new ArrayList<>();
        List<Role> mixList = new ArrayList<>();
    }

    static class Team {
        int wave;
        List<Role> member = new ArrayList<>();
        double totalDamage;
        Role mainC;
        Role mainN;

        public double getTotalDamage() {
            calcDamage(this);
            return totalDamage;
        }

        public boolean isCore() {
            return getTotalDamage() * 1000 > N_OVER_VAL * C_OVER_VAL * 1.1; // 伤害溢出
        }

        public boolean isNeedUp() {
            return getTotalDamage() * 1000 < N_OVER_VAL * C_OVER_VAL * 0.9; // 伤害不足
        }
    }

    // --- 全局缓存 ---
    private static final Map<String, Double> naiMultiplierMap = new HashMap<>();

    public static void main(String[] args) throws Exception {
        loadNaiMultiplier();

        // 1. 解析数据
        List<Role> allRoles = parseRoleData();
        int totalWave = allRoles.size() / 4;

        // 2. 按玩家拆分资源 (优化：预分配容量)
        Map<String, PlayerEntity> playerMap = new HashMap<>(4);
        for (String name : PLAYER_NAMES) playerMap.put(name, new PlayerEntity());

        for (Role role : allRoles) {
            PlayerEntity player = playerMap.get(role.owner);
            if (role.isC) player.cList.add(role);
            else if (role.value > 0) player.naiList.add(role);
            else player.mixList.add(role);
        }

        // 3. 全局排序 (优化：一次性排序，避免重复)
        List<Role> allC = allRoles.stream()
                .filter(r -> r.isC && r.value > 0)
                .sorted((a, b) -> {
                    int intA = (int) (a.value), intB = (int) (b.value);
                    int compare = Integer.compare(intB / 100, intA / 100);
                    if (compare == 0) {
                        return Integer.compare(intA % 100, intB % 100);
                    }
                    return compare;
                })
                .toList();

        List<Role> allNaiAsc = allRoles.stream()
                .filter(r -> !r.isC && r.value > 0)
                .sorted(Comparator.comparingDouble(r -> r.value))
                .toList();

        // 4. 核心配对：大C配小奶
        List<Team> teamList = new ArrayList<>(totalWave);
        for (int i = 0; i < totalWave; i++) {
            Team team = new Team();
            team.wave = i + 1;
            Role mainC = allC.get(i);

            // 寻找非同名且未使用的奶 (从头跳过部分最小的奶开始找，到最后一个刚好凑满)
            Role mainNai = null;
            for (int j = allNaiAsc.size() - totalWave; j < allNaiAsc.size(); j++) {
                Role tempNai = allNaiAsc.get(j);
                if (!tempNai.used && !tempNai.owner.equals(mainC.owner)) {
                    mainNai = tempNai;
                    break;
                }
            }
            // 前几个小奶兜底
            if (mainNai == null) {
                for (int j = allNaiAsc.size() - totalWave - 1; j > 0; j--) {
                    Role tempNai = allNaiAsc.get(j);
                    if (!tempNai.used && !tempNai.owner.equals(mainC.owner)) {
                        mainNai = tempNai;
                        break;
                    }
                }
            }
            if (mainNai == null) {
                throw new RuntimeException("队伍未分配到奶");
            }

            mainC.used = true;
            mainNai.used = true;
            team.member.add(mainC);
            team.member.add(mainNai);
            team.mainC = mainC;
            team.mainN = mainNai;
            teamList.add(team);
        }

        // 5. 计算伤害并排序
        calcDamage(teamList);
        List<Team> sortedTeam = new ArrayList<>(teamList);
        // 排序，优先给伤害最低的 lastPreNum 波选副c， 然后给伤害最高的 选混子，后面是中间的，按顺序选
        sortedTeam.sort(Comparator.comparingDouble(t -> t.totalDamage));
        if (lastPreNum < 0) {
            int num = sortedTeam.size() - 1;
            for (Team team : sortedTeam) {
                if (team.isCore()) {
                    num--;
                }
            }
            reorderLastToFront(sortedTeam, num);
        } else {
            reorderLastToFront(sortedTeam, lastPreNum);
        }

        // 6. 填充剩余队员
        fillMember(sortedTeam, allRoles);
        calcDamage(sortedTeam);

        // 7. 输出
        sortedTeam.sort(Comparator.comparingInt(t -> t.wave));
//        printTable(sortedTeam);
        printTableConsole(sortedTeam);
    }

    /**
     * 解析角色文件
     */
    private static List<Role> parseRoleData() throws IOException {
        List<Role> allRoles = new ArrayList<>();
        InputStream stream = ArrangeTool.class.getResourceAsStream(roleTxtPath);
        if (stream == null) throw new FileNotFoundException("roleTxtPath not found");

        try (BufferedReader reader = new BufferedReader(new InputStreamReader(stream, StandardCharsets.UTF_8))) {
            String line;
            String currOwner = "";
            while ((line = reader.readLine()) != null) {
                line = line.trim();
                if (line.isEmpty()) continue;

                if (PLAYER_NAMES.contains(line)) {
                    currOwner = line;
                }
                // 1. 优先判断是否为纯数字行 (C)
                else if (line.matches("^[0-9 ]+$")) {
                    String[] arr = line.split(" ");
                    for (String s : arr) {
                        if (s.isEmpty()) continue;
                        Role r = new Role();
                        r.owner = currOwner;
                        r.isC = true;
                        r.value = Double.parseDouble(s);
                        allRoles.add(r);
                    }
                }
                // 2. 再判断是否为包含小数点的行 (奶)
                else if (line.contains(".")) {
                    String[] arr = line.split(" ");
                    for (String s : arr) {
                        if (s.isEmpty()) continue;
                        Role r = new Role();
                        r.owner = currOwner;
                        r.isC = false;
                        if (s.contains("m")) {
                            s = s.replace("m", "");
                            r.isXiaoMonv = true;
                        }
                        r.buffValue = s;
                        r.value = Double.parseDouble(s);
                        allRoles.add(r);
                    }
                }
                // 3. 最后处理混子
                else if (line.contains("x") || line.contains("+")) {
                    String[] arr = line.split(" ");
                    for (String s : arr) {
                        if (s.isEmpty()) continue;
                        Role r = new Role();
                        r.owner = currOwner;
                        r.isC = false;
                        r.value = 0;
                        r.isBuffMix = "+".equals(s);
                        allRoles.add(r);
                    }
                }
            }
        }
        return allRoles;
    }

    /**
     * 读取奶倍率配置
     */
    private static void loadNaiMultiplier() throws IOException {
        naiMultiplierMap.clear();
        InputStream inputStream = ArrangeTool.class.getResourceAsStream("/team/multiplier.txt");
        if (inputStream == null) throw new FileNotFoundException("找不到倍率配置文件 multiplier.txt");

        try (BufferedReader reader = new BufferedReader(new InputStreamReader(inputStream, StandardCharsets.UTF_8))) {
            String line;
            while ((line = reader.readLine()) != null) {
                line = line.trim();
                if (line.isEmpty()) continue;
                String[] parts = line.split("\\s+");
                naiMultiplierMap.put(parts[0], Double.parseDouble(parts[1]));
            }
        }
    }

    /**
     * 将列表按序号升序排列，并将最后 n 个元素移到最前面
     * 例如：[1,2,3...24] -> [21,22,23,24,1,2...20]
     * @param teamList 需要重排序的队伍列表
     * @param n 需要移到前面的元素数量
     */
    /**
     * 将列表按序号升序排列，并将最后 n 个元素按降序移到最前面
     * 例如：[1,2,3...24] -> [24,23,22,1,2...21]
     *
     * @param teamList 需要重排序的队伍列表
     * @param n        需要移到前面的元素数量
     */
    private static void reorderLastToFront(List<Team> teamList, int n) {
        // 边界检查
        if (teamList == null || teamList.isEmpty() || n <= 0 || n >= teamList.size()) {
            return;
        }

        // 1. 先按序号升序排列
        teamList.sort(Comparator.comparingInt(t -> t.wave));

        // 2. 将最后 n 个元素移到最前面（降序）
        int size = teamList.size();
        List<Team> lastN = new ArrayList<>(teamList.subList(size - n, size));
        // 关键修改：Collections.reverse 反转，让最后 n 个变成降序
        Collections.reverse(lastN);

        List<Team> rest = new ArrayList<>(teamList.subList(0, size - n));

        teamList.clear();
        teamList.addAll(lastN);
        teamList.addAll(rest);
    }

    /**
     * 计算队伍伤害 (优化：减少Stream使用，提升计算性能)
     */
    private static void calcDamage(List<Team> teamList) {
        for (Team team : teamList) {
            calcDamage(team);
        }
    }

    private static void calcDamage(Team team) {
        double sumC = 0;
        double mainCVal = 0;
        Role mainNaiRole = null;
        int buffMixCount = 0;

        // 手动遍历代替 Stream，减少对象创建开销
        for (Role r : team.member) {
            if (r.isC) {
                sumC += r.value;
                if (r.value > mainCVal) {
                    mainCVal = r.value;
                }
            } else if (r.value > 0) {
                if (mainNaiRole == null || r.value > mainNaiRole.value) {
                    mainNaiRole = r;
                }
            } else if (r.isBuffMix) {
                buffMixCount++;
            }
        }

        // 混子加成逻辑
        if (buffMixCount > 0) {
            sumC += mainCVal * MIX_BUFF_RATE * buffMixCount;
            mainCVal *= (1 + MIX_BUFF_RATE * buffMixCount);
        }

        double dmg;
        if (mainNaiRole != null) {
            double realMulti = naiMultiplierMap.getOrDefault(mainNaiRole.buffValue, 1.0);
            double dmgWithXmv = (sumC - mainCVal) * realMulti + mainCVal * (realMulti + 400);
            if (team.member.stream().filter(r -> !r.isC && r.value > 0).count() == 1) {
                // 单奶公式
                if (mainNaiRole.isXiaoMonv) {
                    dmg = dmgWithXmv;
                } else {
                    dmg = sumC * realMulti;
                }
            } else {
                // 双奶公式
                if (mainNaiRole.isXiaoMonv) {
                    dmg = (dmgWithXmv) * SUN_BUFF_RATE;
                } else {
                    dmg = sumC * realMulti * SUN_BUFF_RATE;
                }
            }
        } else {
            dmg = sumC; // 无奶情况
        }
        team.totalDamage = dmg / 1000;
    }

    /**
     * 补满4人队伍 (优化：提取选人逻辑，代码更清晰)
     */
    private static void fillMember(List<Team> teamList, List<Role> allRoles) {
        // 初始化资源池
        Map<String, List<Role>> naiPool = initPool();
        Map<String, List<Role>> buffMixPool = initPool();
        Map<String, List<Role>> normalMixPool = initPool();
        Map<String, List<Role>> cPool = initPool();

        // 填充资源池
        for (Role role : allRoles) {
            if (role.used) continue;
            Map<String, List<Role>> targetPool;
            if (!role.isC && role.value > 0) targetPool = naiPool;
            else if (!role.isC && role.isBuffMix) targetPool = buffMixPool;
            else if (!role.isC) targetPool = normalMixPool;
            else targetPool = cPool;
            targetPool.get(role.owner).add(role);
        }

        // 排序C池（从小到大），方便取最小C
        for (List<Role> list : cPool.values()) {
            list.sort(Comparator.comparingDouble(r -> r.value));
        }

        // 逐队补人
        for (Team team : teamList) {
            Set<String> banOwner = team.member.stream().map(r -> r.owner).collect(Collectors.toSet());
            while (team.member.size() < 4) {
                Role selected = selectCandidate(team.isCore(), team.isNeedUp(), banOwner, naiPool, buffMixPool, normalMixPool, cPool);
                if (selected == null) break; // 没人可选了
                selected.used = true;
                banOwner.add(selected.owner);
                team.member.add(selected);
            }
        }
    }

    private static Map<String, List<Role>> initPool() {
        Map<String, List<Role>> map = new HashMap<>();
        for (String name : PLAYER_NAMES) map.put(name, new ArrayList<>());
        return map;
    }

    /**
     * 选人策略 (提取自 fillMember，保持逻辑完全一致)
     */
    private static Role selectCandidate(boolean isCore, boolean isNeedUp, Set<String> banOwner,
                                        Map<String, List<Role>> naiPool, Map<String, List<Role>> buffMixPool,
                                        Map<String, List<Role>> normalMixPool, Map<String, List<Role>> cPool) {

        // 1. 伤害溢出策略 (优先混子)
        if (isCore) {
            Role r = findFirst(banOwner, normalMixPool); // 混子
            if (r != null) return r;
            r = findFirst(banOwner, cPool); // 小号C
            if (r != null) return r;
            r = findFirst(banOwner, buffMixPool); // 群猎
            if (r != null) return r;
            r = findFirst(banOwner, naiPool);  // 太阳奶
            if (r != null) return r;
        }
        // 2. 伤害不足策略 (优先大C)
        else if (isNeedUp) {
            Role r = findFirstFromEnd(banOwner, cPool); // 大号C
            if (r != null) return r;
            r = findFirst(banOwner, naiPool);  // 太阳奶
            if (r != null) return r;
            r = findFirst(banOwner, buffMixPool); // 群猎
            if (r != null) return r;
        }
        // 3. 普通策略
        else {
            Role r = findFirst(banOwner, cPool); // 小号C
            if (r != null) return r;
            r = findFirst(banOwner, buffMixPool); // 群猎
            if (r != null) return r;
            r = findFirst(banOwner, naiPool); // 太阳奶
            if (r != null) return r;
        }

        // 4. 兜底策略 (普通混子)
        return findFirst(banOwner, normalMixPool);
    }

    // 辅助方法：从列表头取 (最小c/第一个)
    private static Role findFirst(Set<String> banOwner, Map<String, List<Role>> pool) {
        // 先找到可以选则的人
        Role role = null;
        String choseName = "";
        for (String name : PLAYER_NAMES) {
            // 选取最小的一个
            if (banOwner.contains(name)) continue;
            List<Role> list = pool.get(name);
            if (list.isEmpty()) {
                continue;
            }
            if (role != null && pool.get(name).get(0).value < role.value) {
                choseName = name;
                role = pool.get(name).get(0);
            } else {
                choseName = name;
                role = pool.get(name).get(0);
            }
        }

        for (String name : PLAYER_NAMES) {
            if (!choseName.equals(name)) continue;
            List<Role> list = pool.get(name);
            if (!list.isEmpty()) return list.remove(0);
        }
        return null;
    }

    // 辅助方法：从列表尾取 (最大c/最后一个)
    private static Role findFirstFromEnd(Set<String> banOwner, Map<String, List<Role>> pool) {
        Role role = null;
        String choseName = "";
        for (String name : PLAYER_NAMES) {
            // 选取最大的一个
            if (banOwner.contains(name)) continue;
            List<Role> list = pool.get(name);
            if (list.isEmpty()) {
                continue;
            }
            if (role != null && pool.get(name).get(0).value > role.value) {
                choseName = name;
                role = pool.get(name).get(0);
            } else {
                choseName = name;
                role = pool.get(name).get(0);
            }
        }

        for (String name : PLAYER_NAMES) {
            if (!choseName.equals(name)) continue;
            List<Role> list = pool.get(name);
            if (!list.isEmpty()) return list.remove(list.size() - 1);
        }
        return null;
    }

    /**
     * 打印表格
     */
    private static void printTable(List<Team> teamList) throws IOException {
        try (PrintWriter writer = new PrintWriter(new OutputStreamWriter(System.out, StandardCharsets.UTF_8))) {
            String header = String.format("波次\t%s\t%s\t%s\t%s\t队伍吃奶总伤害(千亿)",
                    PLAYER_NAMES.get(0), PLAYER_NAMES.get(1), PLAYER_NAMES.get(2), PLAYER_NAMES.get(3));
            writer.println(header);

            for (Team t : teamList) {
                Map<String, String> map = new HashMap<>();
                for (String name : PLAYER_NAMES) map.put(name, "");

                for (Role r : t.member) {
                    String label;
                    if (r.isC) {
                        label = (t.mainC == r ? "\033[31m" + r.value + "主c\033[0m" : r.value + "副c");
                    } else if (r.value > 0) {
                        if (t.mainN == r) {
                            label = (r.isXiaoMonv ? "\033[32m" + r.value + "偏爱奶\033[0m" : "\033[32m" + r.value + "主奶\033[0m");
                        } else {
                            label = r.value + "太阳奶";
                        }
                    } else {
                        label = r.isBuffMix ? "群猎" : "混子";
                    }

                    String oldVal = map.get(r.owner);
                    map.put(r.owner, oldVal.isBlank() ? label : oldVal + "、" + label);
                }

                writer.printf("%d\t%s\t%s\t%s\t%s\t%.2f%n", t.wave,
                        map.get(PLAYER_NAMES.get(0)), map.get(PLAYER_NAMES.get(1)),
                        map.get(PLAYER_NAMES.get(2)), map.get(PLAYER_NAMES.get(3)), t.totalDamage);
            }
        }
    }

    private static void printTableConsole(List<Team> teamList) throws IOException {
        try (PrintWriter writer = new PrintWriter(new OutputStreamWriter(System.out, StandardCharsets.UTF_8))) {
            // 定义列宽（根据实际显示效果微调，建议留足余量）
            int[] widths = {4, 15, 15, 15, 15, 20};
            String[] headers = {"波次", PLAYER_NAMES.get(0), PLAYER_NAMES.get(1), PLAYER_NAMES.get(2), PLAYER_NAMES.get(3), "队伍吃奶总伤害(千亿)"};

            // 1. 打印表头
            StringBuilder headerLine = new StringBuilder();
            for (int i = 0; i < headers.length; i++) {
                headerLine.append("| ").append(formatCell(headers[i], widths[i], true)).append(" ");
            }
            headerLine.append("|");
            writer.println(headerLine);

            // 打印表头下的分割线
            StringBuilder sepLine = new StringBuilder();
            for (int w : widths) {
                sepLine.append("+").append("-".repeat(w + 1));
            }
            sepLine.append("+");
            writer.println(sepLine);

            // 2. 打印数据行
            for (Team t : teamList) {
                Map<String, String> map = new LinkedHashMap<>(); // 保持插入顺序
                for (String name : PLAYER_NAMES) map.put(name, "");

                // --- 核心逻辑：生成带颜色的单元格内容 ---
                for (Role r : t.member) {
                    String label;
                    if (r.isC) {
                        String val = String.format("%.0f", r.value);
                        label = (t.mainC == r ? "\033[31m" + val + "主c\033[0m" : val + "副c");
                    } else if (r.value > 0) {
                        if (t.mainN == r) {
                            label = (r.isXiaoMonv ? "\033[32m" + r.value + "偏爱奶\033[0m" : "\033[32m" + r.value + "主奶\033[0m");
                        } else {
                            label = r.value + "太阳奶";
                        }
                    } else {
                        label = r.isBuffMix ? "群猎" : "混子";
                    }

                    String oldVal = map.get(r.owner);
                    map.put(r.owner, oldVal.isBlank() ? label : oldVal + "、" + label);
                }

                // --- 组装行数据 ---
                List<String> rowData = new ArrayList<>();
                rowData.add(String.valueOf(t.wave));
                for (String name : PLAYER_NAMES) rowData.add(map.get(name));

                String damage = String.format("%.0f", t.totalDamage);
                if (t.isNeedUp()) {
                    rowData.add("\033[31m" + damage + "\033[0m");
                } else {
                    rowData.add(damage);
                }

                // --- 格式化输出 ---
                StringBuilder line = new StringBuilder();
                for (int i = 0; i < rowData.size(); i++) {
                    // 第一列左对齐，中间列左对齐，最后一列右对齐更好看
                    boolean alignLeft = (i < rowData.size() - 1);
                    line.append("| ").append(formatCell(rowData.get(i), widths[i], alignLeft)).append(" ");
                }
                line.append("|");
                writer.println(line);
            }
        }
    }

    /**
     * 获取字符串的“视觉长度”
     * 1. 去除 ANSI 颜色代码（不占位）
     * 2. 中文字符算作 2 个单位长度
     */
    private static int getVisualLength(String s) {
        if (s == null) return 0;
        // 移除颜色代码
        String clean = s.replaceAll("\u001B\\[[;\\d]*m", "");
        int len = 0;
        for (char c : clean.toCharArray()) {
            // 判断是否为中日韩统一表意文字（涵盖常用汉字）
            if (Character.UnicodeScript.of(c) == Character.UnicodeScript.HAN) {
                len += 2;
            } else {
                len += 1;
            }
        }
        return len;
    }

    /**
     * 格式化单个单元格，自动补齐因中文导致的宽度差异
     */
    private static String formatCell(String content, int width, boolean alignLeft) {
        if (content == null) content = "";
        int visualLen = getVisualLength(content);

        // 核心修复：目标宽度 - 视觉长度 = 需要填充的空格数
        int padding = Math.max(0, width - visualLen);

        StringBuilder sb = new StringBuilder(content);
        String spaces = " ".repeat(padding);

        if (alignLeft) {
            sb.append(spaces);
        } else {
            sb.insert(0, spaces);
        }
        return sb.toString();
    }

}