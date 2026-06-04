"""
生成视频号场景 baseline 种子数据用于开发和演示。
MVP 使用可控模拟数据，不采集或爬取非授权账号内容。

Usage:
    python scripts/seed_data.py
"""
import sqlite3
import json
import random
import os

DB_PATH = os.path.join(os.path.dirname(__file__), "..", "backend", "data", "baseline.db")

SCENARIOS = {
    "local": {
        "titles": [
            "武汉周末遛娃别再只去商场了", "这家社区小店为什么天天排队",
            "人均39的亲子室内馆，我替你踩过点了", "本地人常去的早餐店，外地人很少知道",
            "带老人吃饭别只看环境，先看这三点", "同城周末一日游，这条路线不绕路",
            "小区门口这家店，为什么复购率这么高", "孩子放学后去哪玩，附近家长可以看看",
        ],
        "tags": ["本地生活", "同城", "门店", "亲子", "探店", "周末", "社区", "到店"],
        "viral_rate": 0.16,
        "engagement": (1200, 22000),
    },
    "knowledge": {
        "titles": [
            "一个方法判断孩子是不是真的听懂了", "别急着买保险，先看懂这三个坑",
            "普通人做短视频，先搞清楚这件事", "这三个信号说明你的账号定位跑偏了",
            "每天5分钟，讲清楚一个容易误会的概念", "为什么你发了很多内容却没人信任",
            "先给结论，再讲原因，完播率会不一样", "这个表格能帮你看懂家庭预算",
        ],
        "tags": ["知识科普", "方法", "避坑", "教育", "效率", "干货", "认知", "教程"],
        "viral_rate": 0.14,
        "engagement": (900, 16000),
    },
    "emotion": {
        "titles": [
            "如果你总是忍不住吼孩子，先听完这段", "中年夫妻最怕的不是吵架，是这件小事",
            "真正让父母寒心的，往往不是没钱", "很多家庭的矛盾，都是从这句话开始的",
            "孩子沉默的时候，父母别急着讲道理", "一个人累久了，最需要的不是鸡汤",
            "关系变淡之前，其实都有这些信号", "别把家人的付出当成理所当然",
        ],
        "tags": ["情感口播", "家庭", "亲子", "婚姻", "关系", "共鸣", "沟通", "中年"],
        "viral_rate": 0.18,
        "engagement": (1600, 28000),
    },
    "enterprise": {
        "titles": [
            "客户为什么宁愿多花20%也选我们", "一家门店从冷清到复购，改了这三件事",
            "别再只介绍产品了，客户想听的是结果", "企业号内容别像宣传册，先讲客户场景",
            "这个案例让客户第一次主动咨询", "门店短视频想获客，先把这句话讲清楚",
            "客户见证怎么拍，才不像硬广", "销售视频别只说优惠，要说解决什么问题",
        ],
        "tags": ["企业号", "客户案例", "获客", "门店", "品牌", "私域", "复购", "转化"],
        "viral_rate": 0.10,
        "engagement": (300, 8000),
    },
    "shop": {
        "titles": [
            "这件东西适不适合你，看完这三点再买", "同样是家用清洁，为什么这款更省事",
            "别被低价骗了，买之前先看这里", "给爸妈买这类产品，先问清楚一个问题",
            "不是所有家庭都适合这款，先看使用场景", "这三个细节，决定你买回去会不会闲置",
            "团购前先看真实体验，不要只看价格", "这款小店商品适合谁，不适合谁",
        ],
        "tags": ["带货", "小店", "团购", "商品", "测评", "家用", "避坑", "购买建议"],
        "viral_rate": 0.15,
        "engagement": (1000, 20000),
    },
    "ip": {
        "titles": [
            "我做个人IP踩过的第一个坑", "普通人建立信任感，不靠人设靠这三件事",
            "如果你刚开始做账号，先别急着追热点", "新人做视频号，最该坚持的是这件事",
            "别把定位写得太大，用户听不懂", "从0开始做账号，先练这三种表达",
            "让别人记住你，不是靠口号", "个人IP最怕的不是没流量，是不可信",
        ],
        "tags": ["个人IP", "创业", "职场", "账号定位", "信任", "表达", "成长", "普通人"],
        "viral_rate": 0.13,
        "engagement": (700, 14000),
    },
}


def generate_notes(category, config, count=500):
    """为指定视频号场景生成模拟内容数据"""
    notes = []
    for _ in range(count):
        title = random.choice(config["titles"])
        title_var = title
        if random.random() > 0.55:
            suffixes = ["", "，建议收藏", "，转给需要的人", "｜真实体验", "｜避坑提醒"]
            title_var = title + random.choice(suffixes)

        num_tags = random.randint(1, 6)
        selected_tags = random.sample(config["tags"], min(num_tags, len(config["tags"])))

        is_viral = random.random() < config["viral_rate"]
        if is_viral:
            likes = random.randint(300, config["engagement"][1])
            collects = random.randint(120, max(200, config["engagement"][1] // 4))
            comments = random.randint(40, max(80, config["engagement"][1] // 12))
        else:
            likes = random.randint(0, config["engagement"][0])
            collects = random.randint(0, max(20, config["engagement"][0] // 5))
            comments = random.randint(0, max(10, config["engagement"][0] // 20))

        content_templates = [
            f"这是一条{category}场景的视频号内容，先给结论，再讲具体案例，最后引导评论或转发。",
            f"围绕{category}用户的真实问题展开，包含开头3秒钩子、过程解释和行动建议。",
            f"适合在朋友圈或微信群被转发，重点讲清楚适合谁、解决什么问题、下一步怎么做。",
        ]

        notes.append((
            category,
            title_var,
            len(title_var),
            random.choice(content_templates),
            json.dumps(selected_tags, ensure_ascii=False),
            random.choice([7, 8, 12, 18, 19, 20, 21]),
            likes,
            collects,
            comments,
            random.choice([500, 1000, 3000, 8000, 20000, 50000, 100000]),
            1 if is_viral else 0,
            1 if random.random() > 0.45 else 0,
            round(random.uniform(0.12, 0.45), 2),
            round(random.uniform(0.35, 0.88), 2),
        ))
    return notes


def seed():
    """写入种子数据"""
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()

    cursor.execute("DELETE FROM notes")

    all_notes = []
    for category, config in SCENARIOS.items():
        all_notes.extend(generate_notes(category, config, 500))

    cursor.executemany("""
        INSERT INTO notes (
            category, title, title_length, content, tags,
            publish_hour, likes, collects, comments, followers,
            is_viral, cover_has_face, cover_text_ratio, cover_saturation
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, all_notes)

    conn.commit()
    print(f"已插入 {len(all_notes)} 条视频号场景种子数据")
    conn.close()


if __name__ == "__main__":
    seed()
