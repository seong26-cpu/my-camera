# 추천 이벤트 목록(presets.js) 생성기 — 2026-11-24 웹 검색 결과에 실제로 나온 주소만 사용
# 플래그: M=월별로 주소가 바뀜(앱이 '출석' 메뉴를 자동으로 찾음) O=오래된/종료 가능 A=앱에서만 참여 D=단일 이벤트 페이지
import json, os
R = 'restricted'
NOTES = {
 'gmarket': ('이벤트 유의사항: "비정상적인 방법에 의한 응모 또는 당첨이 의심될 경우 당첨 자격 취소, 민형사상 책임"', 'https://www.gmarket.co.kr/e/bigs/tab4'),
 'samsung': ('이벤트 유의사항: "반복 참여 프로그램 이용 등 비정상적인 방법으로 참여 시 참여 제한"', 'https://samsung.com/sec/galaxyeunha2'),
 'nol': ('NOL DRAW 유의사항: "비정상적인 방식으로 응모하면 접속 차단"', 'https://nol.yanolja.com/raffle-deal/NOLDRAW'),
 'hana': ('하나은행 이벤트 유의사항: "비정상적인 방법으로 이벤트 참여 시 당첨 취소"', 'https://m.kebhana.com/cont/event/new/event01/1516884_152465.jsp'),
}
E = [
# 쇼핑·오픈마켓
('G마켓 출석체크','https://promotion.gmarket.co.kr/Event/pluszone.asp','attend','쇼핑','', 'gmarket'),
('G마켓 빅스마일데이 혜택','https://www.gmarket.co.kr/e/bigs/benefit','fcfs','쇼핑','D','gmarket'),
('옥션 프로모션(출석)','https://promotion.auction.co.kr/promotion/MD/eventview.aspx?txtMD=05F804C1E8','attend','쇼핑','O',''),
('옥션 빅스마일데이 혜택','https://www.auction.co.kr/e/bigs/benefit','fcfs','쇼핑','D',''),
('11번가 혜택ZIP(출첵)','https://promo.11st.co.kr/view/m/20250201-benefit','attend','쇼핑','A',''),
('SSG.COM 출석체크','https://event.ssg.com/eventDetail.ssg?nevntId=1000000020298&domainSiteNo=7018','attend','쇼핑','M',''),
('이마트몰 이벤트(출석·룰렛)','https://emart.ssg.com/event/eventMain.ssg?Egnb=event','attend','쇼핑','',''),
('롯데ON 출석체크존','https://www.lotteon.com/event/attendancezone/eventDtl?evNo=E20220727009326','attend','쇼핑','MO',''),
('티몬 출석체크','http://m.benefit.tmon.co.kr/promotions/page/attendance','attend','쇼핑','O',''),
('무신사 출석체크','https://www.musinsa.com/user/mission/attendance','attend','패션','A',''),
('무신사 이벤트·래플','https://www.musinsa.com/events/main','fcfs','패션','',''),
('W컨셉 출석체크','https://event.wconcept.co.kr/promo/attend','attend','패션','M',''),
('LF몰 출석체크','https://m.lfmall.co.kr/planning.do?cmd=getEventDetail&datacls=65584','attend','패션','M',''),
('SSF SHOP 출석 이벤트','https://www.ssfshop.com/event/EV202609280158395/view','attend','패션','O',''),
('지그재그 래플(출석 응모권)','https://zigzag.kr/raffle/detail/171','attend','패션','O',''),
('이니스프리 매일 출석체크','https://m.innisfree.com/kr/ko/ca/event/106239','attend','뷰티','M',''),
('올리브영 출석체크 기획전','https://www.oliveyoung.co.kr/store/planshop/getPlanShopDetail.do?dispCatNo=500000102240003','attend','뷰티','MO',''),
('아모레몰 이벤트(출석체크)','https://www.amoremall.com/kr/ko/display/nowEvent?displayMenuId=nowEvent','attend','뷰티','',''),
('아리따움 이벤트(출석)','https://www.aritaum.com/event/ev/eventView/EVT2203REWARD.do?i_sMobileCheck=N','attend','뷰티','O',''),
('인터파크 펫 출석체크','http://m.shop.interpark.com/event/petAttendance.html','attend','쇼핑','O',''),
('다나와 DPG 출석체크','https://dpg.danawa.com/mobile/attendance/main','attend','쇼핑','',''),
('에누리 출석체크','https://www.enuri.com/event2024/attendance.jsp','attend','쇼핑','O',''),
('컴퓨존 이벤트존','https://www.compuzone.co.kr/event_zone/eventzone_win_view.htm?EventNo=63689','form','쇼핑','D',''),
('롯데하이마트 출석체크','http://m.e-himart.co.kr/app/event/eventDetails?evtNo=attend&scrollPoint=LG','attend','쇼핑','A',''),
('삼성닷컴 출석체크','https://www.samsung.com/sec/event/attendanceEvent/?eventNo=32208','attend','가전','M','samsung'),
# 홈쇼핑·백화점·마트·면세
('GS SHOP 출석 룰렛','https://event.gsshop.com/event/attend','attend','홈쇼핑','',''),
('CJ온스타일 출석체크','https://display.cjonstyle.com/p/exhibition/exhibitionDetail?plnExhbId=202207190738','attend','홈쇼핑','',''),
('현대Hmall','https://www.hmall.com','attend','홈쇼핑','',''),
('롯데홈쇼핑 매일 룰렛','https://m.lotteimall.com/event/viewEverydayRouletteEvt.lotte?mno=L261685&giftRewardYn=Y','attend','홈쇼핑','A',''),
('신세계라이브쇼핑 출석체크','https://m.shinsegaetvshopping.com/event/attend-info','attend','홈쇼핑','A',''),
('공영홈쇼핑 출석체크','https://www.gongyoungshop.kr/event/selectEventDetail.do?eventNo=1917','attend','홈쇼핑','M',''),
('홈앤쇼핑 이벤트','https://m.hnsmall.com/event/view/202306/c4','attend','홈쇼핑','O',''),
('AK몰 모바일 출석체크','https://m.akmall.com/event/RightVisit.do','attend','백화점','',''),
('롯데백화점 출석체크','https://m.lotteshopping.com/event/eventDetail?entNo=ENT00000000000005464','attend','백화점','M',''),
('홈플러스 출석체크','https://my.homeplus.co.kr/event/atnd?evntNo=6842','attend','마트','M',''),
('현대백화점면세점 출석체크','https://www.hddfs.com/event/op/evnt/evntDetail.do?evntId=0004523','attend','면세점','M',''),
('신세계면세점 혜택','https://www.ssgdfs.com/kr/event/initEventMain','attend','면세점','',''),
('롯데면세점 혜택','https://kor.lottedfs.com/kr/eventmain/benefit','attend','면세점','',''),
# 도서·문화·상품권
('예스24 앱 출석체크','https://event.yes24.com/chulcheck','attend','도서','A',''),
('예스24 티켓 출석','https://m.ticket.yes24.com/Event/2020/DailyStamp.aspx','attend','도서','',''),
('알라딘 램프데이 출석','https://www.aladin.co.kr/events/wevent.aspx?EventId=316596','attend','도서','A',''),
('교보문고 출석체크','http://www.kyobobook.co.kr/event/dailyCheckSpci.laf','attend','도서','',''),
('인터파크도서 출석체크','https://book.interpark.com/event/Event2015.do?_method=MobileMonthlyAttendEventNewMainM','attend','도서','O',''),
('컬쳐랜드 출석체크','https://m.cultureland.co.kr/evn/chulcheck.do','attend','상품권','',''),
('컬쳐랜드 프리존','https://m.cultureland.co.kr/freeZone/fzoneMain.do','attend','상품권','',''),
('해피머니 출석 적립','https://www.happymoney.co.kr/svc/twentyEvent/bonusEvent.hm','attend','상품권','O',''),
('CGV 경품 현황','https://cgv.co.kr/evt/giveawayState','form','문화','',''),
('롯데시네마 이벤트','https://www.lottecinema.co.kr/NLCMS/Event/EventTemplateButton?eventId=101110014223033','form','문화','DA',''),
('KREAM 프로모션','https://kream.co.kr/exhibitions/1224','form','패션','D',''),
# 포인트·간편결제·앱테크
('네이버페이 퀴즈 미션','https://point.pay.naver.com/mission-detail?rank=6&mssCode=promotion&promoCode=quiz_s','quiz','포인트','',''),
('OK캐쉬백 이벤트(오퀴즈)','https://m.okcashbag.com/life/event/eventMain.mocb','quiz','포인트','A',''),
('CJ ONE 진행중 득템프(출석)','https://www.cjone.com/cjmweb/event-coupon/stamp/list.do','attend','포인트','',''),
('L.POINT 이벤트','https://m.lpoint.com/app/event/LWEA100210.do?evnId=EVN503917','attend','포인트','O',''),
('토스 (만보기·퀴즈)','package:viva.republica.toss','quiz','포인트','A',''),
('카카오뱅크 굿모닝 챌린지','https://event.kakaobank.com/p/challenge?i=2306','attend','은행','A',''),
('카카오뱅크 음악 퀴즈','https://event.kakaobank.com/p/musicquiz','quiz','은행','D',''),
('thinkyou 경품 이벤트 모음','https://thinkyou.co.kr/mobile/eventMain/','form','이벤트모음','',''),
# 카드
('하나카드 진행중 이벤트','https://m.hanacard.co.kr/MPAEVT100M.web','form','카드','',''),
('삼성카드 진행 중 이벤트','https://samsungcard.com/personal/event/ing/UHPPBE1403M0.jsp','form','카드','',''),
('신한카드 퀴즈 이벤트','https://www.shinhancard.com/pconts/html/benefit/event/1224657_2239.html','quiz','카드','O',''),
('현대카드 이벤트','https://www.hyundaicard.com/cms_content/cp_event/220474_event_web.html','form','카드','D',''),
('우리카드 이벤트','https://pc.wooricard.com/dcpc/yh1/ext/ext02/crd/H1EXT202S03.do','form','카드','D',''),
('신한카드 마이카 진행 중 이벤트','https://mycar.shinhancard.com/conts/html/event/curr_event/1216052_3588.html','form','카드','D',''),
('NH농협카드 이벤트','https://card.nonghyup.com/servlet/IpCb2002R.act?EVT_CRT_SQNO=4930','form','카드','D',''),
# 은행
('KB국민은행 이벤트','https://omoney.kbstar.com/quics?QSL=F&cc=b033091%3Ab032977&page=C016559&%EC%9D%B4%EB%B2%A4%ED%8A%B8%EC%9D%BC%EB%A0%A8%EB%B2%88%ED%98%B8=342819','form','은행','D',''),
('하나은행 퀴즈 이벤트','https://m.kebhana.com/cont/event/new/event01/1490283_152465.jsp','quiz','은행','D','hana'),
('토스뱅크 이벤트','https://www.tossbank.com/articles/200event','form','은행','D',''),
# 증권
('KB증권 이벤트(출석)','https://m.kbsec.com/go.able?linkcd=e015000','attend','증권','',''),
('한국투자증권 퀴즈 이벤트','https://www.truefriend.com/bankis/notice/Event.jsp?cmd=BK05ba02_View&num=4441','quiz','증권','D',''),
('삼성증권 진행중 이벤트','https://www.samsungpop.com/ux/kor/customer/guide/eventguide/eventViewContent.do?menuNo=01010900&MenuSeqNo=3032','quiz','증권','O',''),
('키움증권 이벤트','https://www3.kiwoom.com/e/inv/event/I2023008Main','quiz','증권','O',''),
('신한투자증권 매일매일 신투DAY','https://www.shinhansec.com/cms/contents/event/240902_everydayShinhan_event_pc.html','attend','증권','O',''),
('미래에셋증권 웹진 금융퀴즈','https://webzine.securities.miraeasset.com/webzine2609/vol2609_event.php','quiz','증권','M',''),
# 보험
('삼성화재 다이렉트 퀴즈','https://direct.samsungfire.com/helpdesk/event/2024/mysweethome_quiz/index.html','quiz','보험','O',''),
('KB손해보험 진행중 이벤트','https://www.kbinsure.co.kr/CG701010601.ec','form','보험','',''),
('교보생명 이벤트','https://www.kyobo.com/dgt/web/event/event-detail/416','form','보험','D',''),
('현대해상 친구소개 이벤트','https://car.hi.co.kr/service.do?m=938c82d86c&cnc_no=785&media_no=A868&companyId=785','form','보험','D',''),
# 통신
('T멤버십 T day','https://sktmembership.tworld.co.kr/mps/pc-bff/program/tday.do','fcfs','통신','',''),
('KT Shop 출석체크','https://shop.kt.com/deal/eventAttend.do','attend','통신','',''),
('KT 데이터 룰렛','https://my.kt.com/etc/DataRouletteInfo.do','attend','통신','',''),
('LG U+ 이벤트','https://www.lguplus.com/display/event/82452','form','통신','D',''),
('U+유모바일 이벤트','https://www.uplusumobile.com/event-benefit/event/ongoing/12422','form','통신','D',''),
# 편의점·카페·외식·식품
('이마트24 출석체크','https://everse.emart24.co.kr/event/view/6955','attend','편의점','M',''),
('포켓CU 출석체크','https://www.pocketcu.co.kr/event/eventView/9005251108809','attend','편의점','M',''),
('GS25 이벤트','http://gs25.gsretail.com/gscvs/ko/customer-engagement/event/detail/stamp?eventCode=8823814802976','form','편의점','O',''),
('스타벅스 이벤트','https://www.starbucks.co.kr/whats_new/campaign_view.do?pro_seq=1048','form','카페','D',''),
('이디야 이벤트','https://ediya.com/contents/event_menu_pick.html','form','카페','D',''),
('롯데잇츠 이벤트','https://www.lotteeatz.com/event/main/selectEvent/18061','form','외식','D',''),
('농심 이벤트(퀴즈)','https://www.nongshim.com/promotion/event/view/2025/11_shinramyunaespa/shinramyunaespa_event','quiz','식품','D',''),
('CJ더마켓 래플','https://m.cjthemarket.com/the/event/raffle','fcfs','식품','',''),
('풀무원 출석체크','https://shop.pulmuone.co.kr/events/stamp?event=405','attend','식품','MO',''),
# 여행·항공
('야놀자 NOL DRAW(매일 10시)','https://nol.yanolja.com/raffle-deal/NOLDRAW','fcfs','여행','','nol'),
('NOL 페스티벌 출석','https://nol.yanolja.com/promotions/nol-festival','attend','여행','','nol'),
('모두투어 이벤트','https://m.modetour.com/event?eidx=8803&mloc=07','form','여행','D',''),
('아시아나 라이크 출석','https://m.flyasiana.com/C/KR/KO/event/asianalike','attend','여행','O',''),
# 공공기관
('대한민국 구석구석 여행가는 달 이벤트','https://korean.visitkorea.or.kr/travelmonth/event.do','quiz','공공','',''),
('대한민국 구석구석 퀴즈 이벤트','https://korean.visitkorea.or.kr/detail/event_detail.do?cotid=8df70efa-8cde-4bfe-a77a-6bfed5771e52','quiz','공공','D',''),
('건강보험 건강iN 독자퀴즈','https://www.nhis.or.kr/magazin/131/html/c10.html','quiz','공공','M',''),
('K-water 퀴즈 이벤트','https://www.kwater.or.kr/news/event/waterDay2026EventView.do?pageNo=1&event_seq=20260318&s_mid=1678','quiz','공공','O',''),
('국민권익위 독자퀴즈','https://www.acrc.go.kr/briefs/202110/sub_11.html','quiz','공공','O',''),
]
FLAG = {'M':'월별로 주소가 바뀜 → 앱이 출석·퀴즈 메뉴를 자동으로 찾아 이동 (못 찾으면 주소 수정)','O':'오래된 자료 · 종료됐을 수 있음 (진행 여부 확인)','A':'앱에서만 참여하는 이벤트일 수 있음','D':'단일 이벤트 페이지 · 기간이 끝나면 꺼 주세요'}
out = []
for i, (name, url, typ, cat, flags, tos) in enumerate(E, 1):
    r = {'id': 'p%03d' % i, 'name': name, 'url': url, 'type': typ, 'cat': cat, 'enabled': False, 'tosChecked': False,
         'preset': True, 'source': url, 'checkedAt': '2026-11-24',
         'flags': [FLAG[c] for c in flags]}
    if tos:
        r['tosStatus'] = R; r['tosNote'], r['tosSource'] = NOTES[tos]
    else:
        r['tosStatus'] = 'unknown'
    if name.startswith('야놀자 NOL DRAW'): r['openTime'] = '10:00'
    out.append(r)
urls = [r['url'] for r in out]
assert len(urls) == len(set(urls)), 'duplicate url'
dst = os.path.join(os.path.dirname(__file__), '../android/app/src/main/assets/ui/presets.js')
with open(dst, 'w', encoding='utf-8') as f:
    f.write('/* 추천 이벤트 목록 — tools/build_presets.py 로 생성 (직접 수정 금지)\n * 2026-11-24 웹 검색 결과에 나온 공식 주소만 수록. 진행 여부·약관은 사용자가 확인. */\n')
    f.write('window.PRESETS = ' + json.dumps(out, ensure_ascii=False, indent=1) + ';\n')
from urllib.parse import urlparse
hosts = set(urlparse(u).netloc.replace('www.','').replace('m.','',1) if not u.startswith('package:') else u for u in urls)
print('entries', len(out), 'restricted', sum(r['tosStatus']==R for r in out), 'distinct hosts', len(hosts))
