import { defineAppConfig } from "@tarojs/taro";

export default defineAppConfig({
  pages: ["pages/index/index"],
  window: {
    navigationBarTitleText: "Digmo 盘中估值",
    navigationBarBackgroundColor: "#f6f7f3",
    navigationBarTextStyle: "black",
    backgroundColor: "#f6f7f3"
  }
});
