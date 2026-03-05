#!/usr/bin/env python3
"""
基金实时估值查询器 v2
用法: python3 fund_estimator.py <基金代码>

功能:
1. 获取基金基本信息
2. 获取实时估值涨跌幅（交易时间）
3. 获取当日净值涨跌幅（收盘后）
4. 获取历史净值数据

数据来源:
- 天天基金网 (fundgz.1234567.com.cn)
- 东方财富 (fundsuggest.eastmoney.com, api.fund.eastmoney.com)
"""

import requests
import json
import re
from datetime import datetime
import sys

class FundEstimator:
    """基金实时估值查询器"""

    def __init__(self):
        self.headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'Referer': 'http://fund.eastmoney.com/'
        }

    def get_realtime_estimate(self, fund_code):
        """获取实时估值（天天基金API）"""
        url = f"https://fundgz.1234567.com.cn/js/{fund_code}.js?rt={int(datetime.now().timestamp()*1000)}"
        try:
            resp = requests.get(url, headers=self.headers, timeout=10)
            match = re.search(r'jsonpgz\((\{.*?\})\)', resp.text)
            if match:
                data = json.loads(match.group(1))
                if data.get('fundcode'):
                    return {
                        "code": data.get("fundcode"),
                        "name": data.get("name"),
                        "nav_date": data.get("jzrq"),
                        "nav": data.get("dwjz"),
                        "estimate": data.get("gsz"),
                        "estimate_change": data.get("gszzl"),
                        "estimate_time": data.get("gztime")
                    }
        except Exception as e:
            pass
        return None

    def get_fund_info(self, fund_code):
        """获取基金详细信息"""
        url = "https://fundsuggest.eastmoney.com/FundSearch/api/FundSearchAPI.ashx"
        params = {"callback": "jQuery", "m": "1", "key": fund_code}
        try:
            resp = requests.get(url, params=params, headers=self.headers, timeout=10)
            match = re.search(r'jQuery\((.*)\)', resp.text)
            if match:
                data = json.loads(match.group(1))
                if data.get('Datas'):
                    fund = data['Datas'][0]
                    info = fund.get('FundBaseInfo', {})
                    return {
                        "code": fund.get('_id'),
                        "name": fund.get('NAME'),
                        "type": info.get('FTYPE'),
                        "manager": info.get('JJJL', '').split(',')[0] if info.get('JJJL') else '',
                        "scale": info.get('JJGM')
                    }
        except Exception as e:
            pass
        return None

    def get_nav_history(self, fund_code, count=10):
        """获取历史净值数据"""
        url = "https://api.fund.eastmoney.com/f10/lsjz"
        params = {
            "fundCode": fund_code,
            "pageIndex": 1,
            "pageSize": count,
            "ut": "fa5fd1943c7b386f172d6893dbfba10b"
        }
        try:
            resp = requests.get(url, params=params, headers=self.headers, timeout=10)
            data = resp.json()
            if data.get('Data', {}).get('LSJZList'):
                records = []
                for item in data['Data']['LSJZList']:
                    records.append({
                        "date": item.get('FSRQ'),
                        "nav": item.get('DWJZ'),
                        "change": item.get('JZZZL')
                    })
                return records
        except Exception as e:
            pass
        return None

    def get_direction_emoji(self, change):
        """根据涨跌幅返回方向和表情"""
        try:
            change = float(change)
        except:
            change = 0

        if change > 1:
            return "📈 大涨", "🔴"
        elif change > 0.3:
            return "📈 上涨", "🔴"
        elif change > 0:
            return "↗️ 微涨", "🔴"
        elif change < -1:
            return "📉 大跌", "🟢"
        elif change < -0.3:
            return "📉 下跌", "🟢"
        elif change < 0:
            return "↘️ 微跌", "🟢"
        else:
            return "➡️ 持平", "⚪"

    def estimate(self, fund_code):
        """查询基金估值"""
        print("=" * 60)
        print(f"基金 {fund_code} 查询结果")
        print(f"查询时间: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
        print("=" * 60)

        # 1. 获取实时估值
        estimate = self.get_realtime_estimate(fund_code)
        # 2. 获取历史净值（用于收盘后显示当日涨跌）
        nav_history = self.get_nav_history(fund_code, 7)

        # 获取基金信息
        info = self.get_fund_info(fund_code)
        fund_name = estimate['name'] if estimate and estimate.get('name') else (info['name'] if info else fund_code)

        print(f"\n【基本信息】")
        print(f"基金代码: {fund_code}")
        print(f"基金名称: {fund_name}")
        if info and info.get('type'):
            print(f"基金类型: {info['type']}")

        # 判断数据状态
        today = datetime.now().strftime('%Y-%m-%d')
        estimate_change = estimate.get('estimate_change') if estimate else None

        # 情况1: 有有效的实时估值（交易时间内）
        if estimate and estimate_change and estimate_change not in ['', '0', '0.00']:
            print(f"\n【实时估值】")
            print(f"净值日期: {estimate['nav_date']}")
            print(f"昨日净值: {estimate['nav']}")
            print(f"估算净值: {estimate['estimate']}")
            print(f"估值时间: {estimate['estimate_time']}")

            change = float(estimate_change)
            direction, emoji = self.get_direction_emoji(change)

            print()
            print("=" * 60)
            print(f"【实时估值】{emoji} {change:+.2f}%")
            print(f"【趋势判断】{direction}")
            print("=" * 60)

            return {
                "code": fund_code,
                "name": fund_name,
                "nav": estimate['nav'],
                "estimate": estimate['estimate'],
                "change": change,
                "direction": direction,
                "mode": "realtime"
            }

        # 情况2: 收盘后，净值已更新，显示当日涨跌
        elif nav_history and len(nav_history) > 0:
            latest = nav_history[0]

            # 检查最新净值是否是今天
            if latest['date'] == today or (estimate and estimate.get('nav_date') == today):
                # 净值已更新
                print(f"\n【当日净值】")
                print(f"净值日期: {latest['date']}")
                print(f"单位净值: {latest['nav']}")

                change = float(latest['change']) if latest.get('change') else 0
                direction, emoji = self.get_direction_emoji(change)

                print()
                print("=" * 60)
                print(f"【当日涨跌】{emoji} {change:+.2f}%")
                print(f"【趋势判断】{direction}")
                print("=" * 60)

                # 显示近7日净值
                if len(nav_history) > 1:
                    print(f"\n【历史净值（近7日）】")
                    print(f"{'日期':<12} {'单位净值':<12} {'涨跌幅':<10}")
                    print("-" * 36)
                    for record in nav_history[:7]:
                        try:
                            c = float(record['change']) if record.get('change') else 0
                            change_str = f"{c:+.2f}%"
                        except:
                            change_str = record.get('change', '-')
                        print(f"{record['date']:<12} {record['nav']:<12} {change_str:<10}")

                return {
                    "code": fund_code,
                    "name": fund_name,
                    "nav": latest['nav'],
                    "change": change,
                    "direction": direction,
                    "mode": "closed"
                }
            else:
                # 净值未更新
                print(f"\n【最新净值】")
                print(f"净值日期: {latest['date']}")
                print(f"单位净值: {latest['nav']}")

                change = float(latest['change']) if latest.get('change') else 0

                # 显示近7日净值
                print(f"\n【历史净值（近7日）】")
                print(f"{'日期':<12} {'单位净值':<12} {'涨跌幅':<10}")
                print("-" * 36)
                for record in nav_history[:7]:
                    try:
                        c = float(record['change']) if record.get('change') else 0
                        change_str = f"{c:+.2f}%"
                    except:
                        change_str = record.get('change', '-')
                    print(f"{record['date']:<12} {record['nav']:<12} {change_str:<10}")

                print("\n⚠️  今日净值尚未更新")
                print("可能原因:")
                print("  - 非交易时间或休市日")
                print("  - 净值更新延迟（通常在收盘后2小时内）")
                print("  - 港股通/QDII基金更新更慢")

                return {
                    "code": fund_code,
                    "name": fund_name,
                    "nav": latest['nav'],
                    "nav_date": latest['date'],
                    "change": change,
                    "mode": "pending"
                }

        # 情况3: 无法获取任何数据
        else:
            print("\n⚠️  暂无数据")
            print("可能原因:")
            print("  - 基金代码错误")
            print("  - 基金已清算或暂停")
            print("  - 网络问题")

            return {
                "code": fund_code,
                "name": fund_name,
                "mode": "error"
            }


def main():
    if len(sys.argv) < 2:
        print("用法: python3 fund_estimator.py <基金代码>")
        print("示例: python3 fund_estimator.py 005051")
        print("\n功能:")
        print("  - 交易时间: 显示实时估值涨跌幅")
        print("  - 收盘后: 显示当日净值涨跌幅")
        print("  - 支持A股基金、港股通/QDII基金")
        sys.exit(1)

    fund_code = sys.argv[1]
    estimator = FundEstimator()
    estimator.estimate(fund_code)


if __name__ == "__main__":
    main()
