#!/usr/bin/env python3
"""
投资组合估值查询器
用法: python3 portfolio_estimator.py [组合名称]

功能:
1. 读取本地投资组合配置
2. 查询每只基金的实时估值
3. 按权重计算组合整体涨跌幅

默认组合: 进攻组合
"""

import requests
import json
import re
from datetime import datetime
import sys
import os

# 组合配置文件路径
PORTFOLIOS_FILE = "/root/.openclaw/workspace/fund-estimator/portfolios.json"


class PortfolioEstimator:
    """投资组合估值查询器"""
    
    def __init__(self):
        self.headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'Referer': 'http://fund.eastmoney.com/'
        }
    
    def get_realtime_estimate(self, fund_code):
        """获取单只基金实时估值"""
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
                        "nav": data.get("dwjz"),
                        "estimate": data.get("gsz"),
                        "change": float(data.get("gszzl", 0)) if data.get("gszzl") else 0,
                        "time": data.get("gztime")
                    }
        except:
            pass
        return None
    
    def load_portfolio(self, name="进攻组合"):
        """加载投资组合配置"""
        try:
            with open(PORTFOLIOS_FILE, 'r', encoding='utf-8') as f:
                data = json.load(f)
                return data.get('portfolios', {}).get(name)
        except Exception as e:
            print(f"加载组合配置失败: {e}")
            return None
    
    def estimate_portfolio(self, name="进攻组合"):
        """查询组合估值"""
        portfolio = self.load_portfolio(name)
        if not portfolio:
            print(f"未找到组合: {name}")
            return None
        
        print("=" * 70)
        print(f"📊 {portfolio['name']} 实时估值")
        print(f"查询时间: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
        print("=" * 70)
        
        results = []
        total_weighted_change = 0
        total_weight = 0
        
        print(f"\n{'基金名称':<20} {'代码':<8} {'权重':<6} {'涨跌幅':<10} {'贡献度':<10}")
        print("-" * 70)
        
        for holding in portfolio['holdings']:
            fund_name = holding['name'][:18]  # 截断过长的名称
            fund_code = holding['code']
            weight = holding['weight']
            
            estimate = self.get_realtime_estimate(fund_code)
            
            if estimate:
                change = estimate['change']
                contribution = change * weight
                total_weighted_change += contribution
                total_weight += weight
                
                change_str = f"+{change:.2f}%" if change > 0 else f"{change:.2f}%"
                contrib_str = f"+{contribution:.4f}%" if contribution > 0 else f"{contribution:.4f}%"
                
                print(f"{fund_name:<20} {fund_code:<8} {weight*100:.0f}%    {change_str:<10} {contrib_str:<10}")
                
                results.append({
                    "name": estimate['name'],
                    "code": fund_code,
                    "weight": weight,
                    "change": change,
                    "contribution": contribution
                })
            else:
                print(f"{fund_name:<20} {fund_code:<8} {weight*100:.0f}%    {'获取失败':<10} {'--':<10}")
        
        print("-" * 70)
        
        # 计算组合整体涨跌
        portfolio_change = total_weighted_change if total_weight > 0 else 0
        
        # 趋势判断
        if portfolio_change > 1:
            direction = "📈 大涨"
            emoji = "🔴"
        elif portfolio_change > 0.3:
            direction = "📈 上涨"
            emoji = "🔴"
        elif portfolio_change > 0:
            direction = "↗️ 微涨"
            emoji = "🔴"
        elif portfolio_change < -1:
            direction = "📉 大跌"
            emoji = "🟢"
        elif portfolio_change < -0.3:
            direction = "📉 下跌"
            emoji = "🟢"
        elif portfolio_change < 0:
            direction = "↘️ 微跌"
            emoji = "🟢"
        else:
            direction = "➡️ 持平"
            emoji = "⚪"
        
        print()
        print("=" * 70)
        print(f"【组合整体估值】{emoji} {portfolio_change:+.2f}%")
        print(f"【趋势判断】{direction}")
        print(f"【有效权重】{total_weight*100:.0f}%")
        print("=" * 70)
        
        return {
            "name": portfolio['name'],
            "change": portfolio_change,
            "direction": direction,
            "holdings": results
        }


def main():
    portfolio_name = sys.argv[1] if len(sys.argv) > 1 else "进攻组合"
    estimator = PortfolioEstimator()
    estimator.estimate_portfolio(portfolio_name)


if __name__ == "__main__":
    main()
